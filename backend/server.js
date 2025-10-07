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

// const allowed = new Set([
//   "http://localhost:5173",
//   "https://rl-question-generator.vercel.app",
// ]);

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://rl-question-generator.vercel.app"
  ],
  methods: ["GET", "POST", "PUT", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

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

const TrainingData = mongoose.model("TrainingData", trainingDataSchema);

// --- routes ---
app.get("/api/health", (_req, res) => res.json({ ok: true }));

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
    const { state, question, options, questionReward, optionsReward, timestamp } = req.body;
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

// --- API LLM: il frontend chiama qui, la chiave resta solo nel server ---
app.post("/api/generate-questions", async (req, res) => {
  try {
    const { prompt, max_tokens = 2000, temperature = 0.7 } = req.body;

    const response = await axios.post(
      process.env.OPENAI_API_URL,
      {
        model: process.env.OPENAI_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens,
        temperature,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const content = response.data?.choices?.[0]?.message?.content ?? "[]";
    res.json({ content });
  } catch (err) {
    console.error("LLM error:", err.response?.data || err.message);
    res.status(500).json({ error: "LLM request failed" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server avviato su http://0.0.0.0:${PORT}`);
});