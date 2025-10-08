/* eslint-disable no-empty */
/* eslint-disable no-unused-vars */
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

trainingDataSchema.index({ "state.service": 1, timestamp: -1 });
trainingDataSchema.index({ "state.service": 1, question: 1 });

const TrainingData = mongoose.model("TrainingData", trainingDataSchema);

// --- routes ---
app.post("/api/save-training-data", async (req, res) => {
  try {
    const data = new TrainingData(req.body);
    await data.save();
    res.status(200).json({ message: "Dati salvati", data });
  } catch (error) {
    res.status(500).json({ message: "Errore salvataggio", error });
  }
});

app.put("/api/update-training-data", async (req, res) => {
  try {
    const {
      state,
      question,
      options,
      questionReward,
      optionsReward,
      timestamp,
    } = req.body;
    const updatedData = await TrainingData.findOneAndUpdate(
      { question, "state.service": state.service },
      { state, question, options, questionReward, optionsReward, timestamp },
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

app.post("/api/generate-questions", async (req, res) => {
  try {
    let exploited = false;

    const {
      prompt,
      state = {},
      askedQuestions = [],
      n = 6,
      max_tokens = 600,
      temperature = 0.7,
    } = req.body;

    // --- 3.1: leggi memoria (rating) per il servizio corrente ---
    const svc = (state?.service || "").trim() || "Logo";
    const askedSet = new Set(
      askedQuestions
        .filter(Boolean)
        .map((q) => q.toLowerCase().replace(/\s+/g, " ").trim())
    );

    const rows = await TrainingData.find({ "state.service": svc })
      .sort({ timestamp: -1 })
      .limit(1000)
      .lean();

    const normQ = (s) =>
      String(s || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[?.!]+$/g, "")
        .trim();

    const scored = rows.map((r) => {
      const q = normQ(r.question);
      const score =
        (Number.isFinite(r.questionReward) ? r.questionReward : 0) +
        (Number.isFinite(r.optionsReward) ? r.optionsReward : 0);
      return {
        question: r.question,
        options: r.options,
        score,
        ts: r.timestamp ? new Date(r.timestamp).getTime() : 0,
        qNorm: q,
      };
    });

    // dedup per domanda, somma score (gli ultimi pesano di più)
    const agg = new Map();
    for (const s of scored) {
      const prev = agg.get(s.qNorm) || { ...s, score: 0, ts: 0 };
      // media pesata semplice: score + bonus recente
      const recentBonus = s.ts ? Math.max(0, (s.ts - prev.ts) / 1e13) : 0;
      prev.score = prev.score + s.score + recentBonus;
      prev.ts = Math.max(prev.ts, s.ts);
      agg.set(s.qNorm, prev);
    }
    const uniq = Array.from(agg.values());

    // top positivi e top negativi
    const positives = uniq
      .filter((x) => x.score > 0 && !askedSet.has(x.qNorm))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    const negatives = uniq
      .filter((x) => x.score < 0)
      .sort((a, b) => a.score - b.score) // più negativo prima
      .slice(0, 30);

    const avoidList = [...askedSet, ...negatives.map((x) => x.qNorm)];

    // helper: proietta example nel formato atteso dal tuo frontend
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

    // --- 3.2: piccola strategia ε-greedy (exploit diretto) ---
    const exploitP = parseFloat(process.env.RL_EXPLOIT_P || "0.35");
    if (seedExamples.length && Math.random() < exploitP) {
      const picked = seedExamples
        .filter((e) => !askedSet.has(normQ(e.question)))
        .slice(0, n);

      if (picked.length) {
        exploited = true; // <— IMPORTANTE
        return res.json({
          content: JSON.stringify(picked),
          meta: {
            strategy: "exploit",
            service: svc,
            positives: positives.length,
            negatives: negatives.length,
            asked: askedSet.size,
          },
        });
      }
    }

    // --- 3.3: prompt con bias: esempi "buoni" + blacklist "cattive" ---
    const guardRails = `
Sei un assistente che propone domande pertinenti per il servizio: "${svc}".

1) Evita di ripetere/parafrasare queste domande (blacklist):
${JSON.stringify(avoidList.slice(0, 50), null, 2)}

2) Prendi come qualità/tono questi esempi valutati bene dagli utenti:
${JSON.stringify(seedExamples, null, 2)}

3) Regole di output:
- Restituisci ESCLUSIVAMENTE un array JSON di ${n} oggetti.
- Ogni oggetto ha: "question" (string), "options" (array di 0..4 stringhe), "type" (string), "requiresInput" (boolean).
- Se "requiresInput" è true ⇒ "options" deve essere [].
- Se "requiresInput" è false ⇒ "options" deve avere esattamente 4 voci concise e distinte.
- Non includere testo fuori dal JSON, né commenti, né markdown.
`;

    const llmPayload = {
      model: process.env.OPENAI_MODEL,
      messages: [{ role: "user", content: `${prompt}\n\n${guardRails}` }],
      max_tokens,
      temperature,
    };

    const response = await axios.post(process.env.OPENAI_API_URL, llmPayload, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    let content = response.data?.choices?.[0]?.message?.content ?? "[]";

    // --- 3.4: parse sicuro e post-filtraggio (dedup + blacklist) ---
    const safeParse = (txt) => {
      try {
        return JSON.parse(txt);
      } catch (_) {
        const i = txt.indexOf("[");
        const j = txt.lastIndexOf("]");
        if (i !== -1 && j !== -1 && j > i) {
          try {
            return JSON.parse(txt.slice(i, j + 1));
          } catch (_) {}
        }
        return [];
      }
    };

    const tooSimilar = (q, list) => {
      const qn = normQ(q);
      return list.some((b) => qn.includes(b) || b.includes(qn));
    };

    const arr = (safeParse(content) || []).filter(
      (x) =>
        x &&
        typeof x.question === "string" &&
        !tooSimilar(x.question, Array.from(askedSet)) &&
        !tooSimilar(x.question, avoidList)
    );

    const finalArr = arr.slice(0, n);
    return res.json({
      content: JSON.stringify(finalArr.length ? finalArr : arr.slice(0, n)),
      meta: {
        strategy: exploited ? "exploit" : "llm",
        service: svc,
        positives: positives.length,
        negatives: negatives.length,
        asked: askedSet.size,
      },
    });
  } catch (err) {
    console.error("LLM error:", err.response?.data || err.message);
    res.status(500).json({ error: "LLM request failed" });
  }
});

app.get("/api/rl/stats", async (req, res) => {
  try {
    const svc = (req.query.service || "Logo").trim();
    const rows = await TrainingData.find({ "state.service": svc })
      .sort({ timestamp: -1 })
      .limit(2000)
      .lean();

    const norm = (s) =>
      String(s || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[?.!]+$/, "")
        .trim();

    // score = questionReward + optionsReward (+ piccolo bonus recency)
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
      const recentBonus = nowTs && nowTs > prev.lastTs ? 0.0001 : 0; // trascurabile, solo tie-break
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
      .reverse(); // più negativi in alto

    res.json({
      service: svc,
      totalRatedPatterns: all.length,
      topPos,
      topNeg,
    });
  } catch (e) {
    res.status(500).json({ error: "stats_failed", details: e.message });
  }
});
