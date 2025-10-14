/* eslint-disable no-empty */
/* eslint-disable no-undef */
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import axios from "axios";

// carica .env dalla cartella backend (stessa del file server.js)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
app.use(cors());
app.use(express.json());

// 🔎 fail-fast se manca la variabile
if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI mancante. Crea backend/.env con MONGO_URI=...");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    // In alternativa alla /basic nella URI, puoi forzare il db:
    // dbName: "basic",
  })
  .then(() => console.log("✅ Connesso a MongoDB Atlas (DB: basic)"))
  .catch((err) => console.error("❌ Errore connessione MongoDB:", err.message));

// Schema/Model collegati alla collection "appuser"
const trainingDataSchema = new mongoose.Schema(
  {
    state: Object,
    question: String,
    options: mongoose.Schema.Types.Mixed,
    questionReward: Number,
    optionsReward: Number,
    timestamp: Date,
  },
  { collection: "appuser" }
);

trainingDataSchema.index({
  "state.service": 1,
  "state.language": 1,
  timestamp: -1,
});
trainingDataSchema.index({
  "state.service": 1,
  "state.language": 1,
  question: 1,
});

const TrainingData = mongoose.model("TrainingData", trainingDataSchema);

// --- routes ---
app.post("/api/save-training-data", async (req, res) => {
  try {
    const { state = {}, language } = req.body;
    const lang = (state && state.language) || language || "it";
    const next = { ...req.body, state: { ...state, language: lang } };

    const data = new TrainingData(next);
    await data.save();
    res.status(200).json({ message: "Dati salvati", data });
  } catch (error) {
    res.status(500).json({ message: "Errore salvataggio", error });
  }
});

app.put("/api/update-training-data", async (req, res) => {
  try {
    const {
      state = {},
      question,
      options,
      questionReward,
      optionsReward,
      timestamp,
      language, // opzionale: se arriva fuori da state, lo usiamo comunque
    } = req.body;

    const lang = (state && state.language) || language || "it";
    const nextState = { ...state, language: lang };

    const updatedData = await TrainingData.findOneAndUpdate(
      {
        question,
        "state.service": nextState.service,
        "state.language": lang, // <-- chiave di partizione lingua
      },
      {
        state: nextState,
        question,
        options,
        questionReward,
        optionsReward,
        timestamp,
      },
      { upsert: true, new: true }
    );

    res.status(200).json({ message: "Dati aggiornati", data: updatedData });
  } catch (error) {
    res.status(500).json({ message: "Errore aggiornamento", error });
  }
});

app.get("/api/get-training-data", async (_req, res) => {
  try {
    const data = await TrainingData.find();
    res.status(200).json({ message: "Dati recuperati", data });
  } catch (error) {
    res.status(500).json({ message: "Errore recupero dati", error });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server avviato su http://0.0.0.0:${PORT}`);
});

// ========= RL helpers: normalizzazione & similarità =========
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // rimuove segni diacritici e punteggiatura
    .replace(/\s+/g, " ")
    .replace(/[?.!,;:]+$/g, "")
    .trim();

const tokens = (s) =>
  new Set(
    norm(s)
      .split(" ")
      .filter((w) => w.length > 2)
  );

const jaccard = (a, b) => {
  const A = tokens(a),
    B = tokens(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
};

const tooSimilar = (q, list, thr = 0.72) =>
  list.some((b) => jaccard(q, b) >= thr);

// ========= /api/generate-questions =========
app.post("/api/generate-questions", async (req, res) => {
  try {
    let exploited = false; // per meta.strategy

    const {
      prompt,
      state = {},
      askedQuestions = [],
      n = 6,
      max_tokens = 600,
      temperature = 0.7,
      language = "it",
    } = req.body;

    const svc = (state?.service || "").trim() || "Logo"; // NEW: usata per query e meta
    const langName = language === "en" ? "English" : "Italian";

    // asked normalizzate
    const askedList = (askedQuestions || []).filter(Boolean);
    const askedNorm = askedList.map((q) => norm(q));
    const askedSet = new Set(askedNorm);

    // 1) Leggi memoria: ultimi pattern per servizio
    const langFilter =
      language === "it"
        ? {
            $or: [
              { "state.language": { $exists: false } },
              { "state.language": "it" },
            ],
          } // IT include legacy
        : { "state.language": language }; // EN (o altre) solo quella lingua

    const rows = await TrainingData.find({
      "state.service": svc,
      ...langFilter,
    })
      .sort({ timestamp: -1 })
      .limit(1000)
      .lean();

    // Scoring di ciascun record
    const scored = rows.map((r) => {
      const qNorm = norm(r.question);
      const score =
        (Number.isFinite(r.questionReward) ? r.questionReward : 0) +
        (Number.isFinite(r.optionsReward) ? r.optionsReward : 0);
      return {
        question: r.question,
        options: r.options,
        score,
        ts: r.timestamp ? new Date(r.timestamp).getTime() : 0,
        qNorm,
      };
    });

    // Aggregazione per domanda normalizzata (somma score + lieve bonus recency)
    const agg = new Map();
    for (const s of scored) {
      const prev = agg.get(s.qNorm) || { ...s, score: 0, ts: 0 };
      const recentBonus = s.ts ? Math.max(0, (s.ts - prev.ts) / 1e13) : 0;
      prev.score = prev.score + s.score + recentBonus;
      prev.ts = Math.max(prev.ts, s.ts);
      agg.set(s.qNorm, prev);
    }
    const uniq = Array.from(agg.values());

    const positives = uniq
      .filter((x) => x.score > 0 && !askedSet.has(x.qNorm))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    const negatives = uniq
      .filter((x) => x.score < 0)
      .sort((a, b) => a.score - b.score)
      .slice(0, 30);

    const avoidList = [
      ...askedNorm, // già chieste nel flusso corrente
      ...negatives.map((x) => x.qNorm), // pattern con feedback negativo
    ];

    const toExample = (x) => {
      const opts = Array.isArray(x.options) ? x.options.slice(0, 4) : x.options;
      const requiresInput =
        (typeof x.options === "string" && x.options === "text-area") ||
        (Array.isArray(x.options) && x.options.length === 0);
      return {
        question: x.question,
        options: requiresInput ? [] : Array.isArray(opts) ? opts : [],
        type: "multiple",
        requiresInput,
      };
    };

    const seedExamples = positives.slice(0, 6).map(toExample);

    // 2) ε-greedy: a volte sfrutta direttamente i top-rated
    const exploitP = parseFloat(process.env.RL_EXPLOIT_P || "0.35");

    // Abilita exploit:
    // - in IT sempre (back-compat), e
    // - in altre lingue SOLO se abbiamo abbastanza esempi per questa lingua (>= n).
    const hasEnoughLangSeeds = seedExamples.length >= n;
    const allowExploit = language === "it" ? true : hasEnoughLangSeeds;

    console.log(
      `[GENQ] allowExploit=${allowExploit} lang=${language} seeds=${seedExamples.length} n=${n}`
    );

    if (allowExploit && Math.random() < exploitP) {
      const picked = seedExamples
        .filter((e) => !askedSet.has(norm(e.question)))
        .slice(0, n);

      if (picked.length === n) {
        exploited = true;
        return res.json({
          content: JSON.stringify(picked),
          meta: {
            strategy: "exploit",
            service: svc,
            positives: positives.length,
            negatives: negatives.length,
            asked: askedSet.size,
            filteredByAsked: 0,
            filteredByBlacklist: 0,
            filteredByBatch: 0,
          },
        });
      }
    }

    // 3) Prompt con guard-rails: esempi positivi + blacklist negative
    const guardRails =
      language === "en"
        ? `
You are an assistant that proposes precise, useful intake questions for the service: "${svc}".

IMPORTANT: Write ALL question texts, option labels, and any other strings in English.

Blacklist (avoid repeating or paraphrasing these questions):
${JSON.stringify(avoidList.slice(0, 50), null, 2)}

Positive examples (style/quality reference only; do NOT copy them verbatim):
${JSON.stringify(seedExamples, null, 2)}

Output rules:
- Return ONLY a JSON array with EXACTLY ${n} objects.
- Each object has: "question" (string), "options" (array with 0..4 strings), "type" (string), "requiresInput" (boolean).
- If "requiresInput" is true ⇒ "options": [].
- If "requiresInput" is false ⇒ "options" MUST have exactly 4 short, distinct options.
- No prose, no markdown, no comments, no code fences. JSON array ONLY.
`.trim()
        : `
Sei un assistente che propone domande pertinenti e utili per il servizio: "${svc}".

IMPORTANTE: Scrivi TUTTE le domande, le opzioni e le etichette in Italiano.

Blacklist (evita di ripetere/parafrasare queste domande):
${JSON.stringify(avoidList.slice(0, 50), null, 2)}

Esempi positivi (solo come riferimento di stile/qualità; NON copiarli alla lettera):
${JSON.stringify(seedExamples, null, 2)}

Regole di output:
- Restituisci SOLO un array JSON con ESATTAMENTE ${n} oggetti.
- Ogni oggetto ha: "question" (string), "options" (array con 0..4 stringhe), "type" (string), "requiresInput" (boolean).
- Se "requiresInput" è true ⇒ "options": [].
- Se "requiresInput" è false ⇒ "options" DEVE avere esattamente 4 opzioni concise e distinte.
- Niente testo fuori dal JSON, niente markdown, niente commenti. SOLO l'array JSON.
`.trim();

    const payload = {
      model: process.env.OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: `You are a question generator. Reply with JSON ONLY. Do not include prose or code fences. Use ${langName} for every string.`,
        },
        { role: "user", content: `${prompt}\n\n${guardRails}` },
      ],
      max_tokens,
      temperature,
    };

    const llm = await axios.post(process.env.OPENAI_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    const rawContent = llm.data?.choices?.[0]?.message?.content ?? "[]";

    // LOG DIAGNOSTICO (breve, sicuro in prod):
    if (process.env.NODE_ENV !== "production") {
      const preview = String(rawContent).slice(0, 200).replace(/\s+/g, " ");
      console.log(`[GENQ][raw preview] ${preview}`);
    }

    const safeParse = (txt) => {
      try {
        return JSON.parse(txt);
      } catch {
        const i = txt.indexOf("[");
        const j = txt.lastIndexOf("]");
        if (i !== -1 && j !== -1 && j > i) {
          try {
            return JSON.parse(txt.slice(i, j + 1));
          } catch {}
        }
        return [];
      }
    };

    // 4) Post-filtri: asked/blacklist + dedup intra-batch + fissaggi formato
    let filteredByAsked = 0,
      filteredByBlacklist = 0,
      filteredByBatch = 0;

    const arr0 = safeParse(rawContent) || [];

    // 4.1: filtra contro storia e blacklist (similarità)
    const arr1 = arr0.filter((x) => {
      if (!(x && typeof x.question === "string")) return false;
      const q = x.question;

      if (tooSimilar(q, askedNorm)) {
        filteredByAsked++;
        return false;
      }
      if (tooSimilar(q, avoidList)) {
        filteredByBlacklist++;
        return false;
      }
      return true;
    });

    // 4.2: dedup intra-batch (tra le domande appena proposte)
    const seen = [];
    const arr2 = [];
    for (const x of arr1) {
      const qn = norm(x.question);
      if (seen.some((prev) => jaccard(prev, qn) >= 0.8)) {
        filteredByBatch++;
        continue;
      }
      seen.push(qn);
      arr2.push(x);
    }

    // 4.3: enforcement del formato (options/ requiresInput)
    const fixFormat = (x) => {
      const out = { ...x };
      const req = !!out.requiresInput;
      if (req) {
        out.options = [];
      } else {
        let opts = Array.isArray(out.options) ? out.options : [];
        // se non sono 4, sistemale (taglia o riempi con placeholder neutri)
        if (opts.length > 4) opts = opts.slice(0, 4);
        if (opts.length < 4) {
          const placeholder = language === "en" ? "Option" : "Opzione";
          while (opts.length < 4)
            opts.push(`${placeholder} ${opts.length + 1}`);
        }
        out.options = opts;
      }
      out.type = typeof out.type === "string" ? out.type : "multiple";
      return out;
    };

    const finalArr = arr2.slice(0, n).map(fixFormat);

    const meta = {
      strategy: exploited ? "exploit" : "llm",
      service: svc,
      positives: positives.length,
      negatives: negatives.length,
      asked: askedSet.size,
      filteredByAsked,
      filteredByBlacklist,
      filteredByBatch,
    };

    return res.json({
      content: JSON.stringify(
        finalArr.length ? finalArr : arr1.slice(0, n).map(fixFormat)
      ),
      meta,
    });
  } catch (err) {
    console.error("GENQ error:", err?.response?.data || err);
    res
      .status(500)
      .json({ error: "LLM request failed", details: err?.message });
  }
});

// ========= /api/rl/stats =========
app.get("/api/rl/stats", async (req, res) => {
  try {
    const svc = (req.query.service || "Logo").trim();
    const language = (req.query.language || "").trim();

    const langFilter = language
      ? { "state.language": language }
      : {
          $or: [
            { "state.language": { $exists: false } },
            { "state.language": "it" },
          ],
        }; // default IT + legacy

    const rows = await TrainingData.find({
      "state.service": svc,
      ...langFilter,
    })
      .sort({ timestamp: -1 })
      .limit(2000)
      .lean();

    // aggrega per domanda normalizzata
    const agg = new Map();
    for (const r of rows) {
      const key = norm(r.question);
      const nowTs = r.timestamp ? new Date(r.timestamp).getTime() : 0;
      const score =
        (Number.isFinite(r.questionReward) ? r.questionReward : 0) +
        (Number.isFinite(r.optionsReward) ? r.optionsReward : 0);

      const prev = agg.get(key) || {
        question: r.question,
        options: r.options,
        score: 0,
        lastTs: 0,
        count: 0,
      };
      const recentBonus = nowTs && nowTs > prev.lastTs ? 0.0001 : 0; // tie-break minimo
      agg.set(key, {
        ...prev,
        score: prev.score + score + recentBonus,
        lastTs: Math.max(prev.lastTs, nowTs),
        count: prev.count + 1,
      });
    }

    const all = Array.from(agg.values()).sort((a, b) => b.score - a.score);
    const topPos = all.filter((x) => x.score > 0).slice(0, 20);
    const topNeg = all
      .filter((x) => x.score < 0)
      .slice(0, 20)
      .reverse();

    return res.json({
      service: svc,
      totalRatedPatterns: agg.size,
      topPos,
      topNeg,
    });
  } catch (e) {
    console.error("STATS error:", e);
    res.status(500).json({ error: "stats_failed", details: e.message });
  }
});
