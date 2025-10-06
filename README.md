# RL Question Generator

A small system that generates tailored client-intake questions using an LLM and improves over time with simple feedback (ratings).
Sensitive keys are **kept server-side** only.

---

## ✨ Features

* **Frontend**: Vite + React (Material UI).
* **Backend**: Express API with Axios.
* **LLM**: OpenAI Chat Completions called **only** from the backend (`/api/generate-questions`).
* **Data**: Ratings stored in **MongoDB Atlas** (DB: `basic`, collection: `appuser`).
* **Heuristics**: Lightweight scoring (`evaluateQuestion`) to keep useful questions and discard weak ones.
* **Fallback**: Local questions are returned if the LLM response can’t be parsed.

---

## 🧱 Stack

* **Frontend:** Vite, React, MUI
* **Backend:** Node.js, Express, Axios
* **Database:** MongoDB Atlas (Mongoose)
* **LLM:** OpenAI Chat Completions API

---

## 📁 Project Structure

```
root
├─ backend/
│  ├─ server.js               # Express API + Mongo connection + LLM proxy route
│  ├─ .env                    # (not versioned) MONGO_URI, OPENAI_*
│  └─ .env.example
├─ src/
│  ├─ services/llm.js         # Calls backend /api/generate-questions
│  ├─ rl/model.js             # evaluateQuestion + saveTrainingData
│  ├─ utils/helpers.js
│  ├─ App.jsx                 # Main UI
│  └─ ...                     # Assets/styles
├─ .gitignore
├─ package.json               # scripts: dev, backend, frontend, build, preview
├─ vite.config.js             # dev proxy: /api → http://localhost:3001
└─ README.md
```

---

## ✅ Prerequisites

* Node.js **18+**
* A **MongoDB Atlas** cluster (free tier is fine)
* An **OpenAI API key**

---

## 🚀 Quick Start (Development)

1. **Install**

   ```bash
   npm install
   ```

2. **Configure environment variables**

   Create `backend/.env` (use `backend/.env.example` as a template):

   ```env
   # Mongo (DB: basic)
   MONGO_URI="mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/basic?retryWrites=true&w=majority"

   # OpenAI
   OPENAI_API_KEY=sk-********************************
   OPENAI_API_URL=https://api.openai.com/v1/chat/completions
   OPENAI_MODEL=gpt-3.5-turbo
   ```

   > If your password has special characters, keep the URI in quotes or URL-encode them (`@` → `%40`, etc).

   (Optional) Client base URL (defaults to `/api`, so you can skip this):

   ```
   VITE_API_BASE=/api
   ```

3. **Run both frontend + backend**

   ```bash
   npm run dev
   ```

   * Frontend: [http://localhost:5173](http://localhost:5173)
   * Backend:  [http://0.0.0.0:3001](http://0.0.0.0:3001)

---

## 🔌 API (Backend)

### `POST /api/generate-questions`

Proxies requests to OpenAI (server-only key).

**Request**

```json
{
  "prompt": "string",
  "max_tokens": 2000,
  "temperature": 0.7
}
```

**Response**

```json
{
  "content": "[{ \"question\": \"...\", \"options\": [\"A\",\"B\",\"C\",\"D\"], \"text-area\": true }]"
}
```

> `content` is a **string** that should be valid JSON. The frontend parses it and applies adjustments (e.g., ensuring exactly 4 options for MCQs).

---

### `PUT /api/update-training-data`

Upsert a rating for a given `(service, question)` pair.

**Request**

```json
{
  "state": { "service": "Logo", "brandNameKnown": true, "...": "..." },
  "question": "Which style do you prefer?",
  "options": ["Minimal","Modern","Vintage","Illustrative"],
  "questionReward": 1,
  "optionsReward": 1,
  "timestamp": "2025-10-06T18:40:00.000Z"
}
```

**Response**

```json
{ "message": "Dati aggiornati", "data": { /* upserted doc */ } }
```

---

### `GET /api/get-training-data`

Returns all stored ratings.

**Response**

```json
{ "message": "Dati recuperati", "data": [ /* docs */ ] }
```

---

## 🗃️ Data Model

**Database:** `basic`
**Collection:** `appuser`

```js
{
  state: Object,            // form state when question was shown
  question: String,         // question text
  options: Mixed,           // 'text-area' or string[] for MCQ
  questionReward: Number,   // -1 | 0 | 1 (heuristic)
  optionsReward: Number,    // -1 | 0 | 1 (heuristic)
  timestamp: Date
}
```

**Recommended unique index (optional, to reduce duplicates):**

* On Atlas → `Indexes` → Create index on:

  * Keys: `{ question: 1, "state.service": 1 }`
  * Unique: **true**

This keeps one record per `(service, question)` and turns future writes into upserts.

---

## 🧠 How the Learning Loop Works

1. **Generate**: the frontend builds a prompt (based on service, brand status, industry, etc.) and calls `/api/generate-questions`.
2. **Adjust**: the client parses the JSON, enforces rules (e.g., exactly 4 options unless the color question).
3. **Score**: `evaluateQuestion(...)` assigns a simple reward based on heuristics (length, duplicates, option quality, etc.).
4. **Rate & Save**: user clicks ratings; the app `PUT`s to `/api/update-training-data` (upsert).
5. **Iterate**: over time you accumulate a clean dataset to refine your question generation strategy.

---

## 🔐 Security Notes

* **Never** store API keys in the frontend (even `VITE_*` vars become public).
* Keep secrets in `backend/.env` and make sure `.gitignore` excludes it.
* If a key ever leaked, **rotate it** (OpenAI dashboard) and push a new deploy.

---

## 🛠️ NPM Scripts

```json
{
  "dev": "concurrently \"npm run backend\" \"npm run frontend\"",
  "backend": "node backend/server.js",
  "frontend": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "lint": "eslint ."
}
```

* In dev, Vite proxies `/api` to `http://localhost:3001` (see `vite.config.js`).

---

## 🚢 Deployment Tips

* Use a host that supports Node (e.g., Render, Fly.io, Railway, Heroku, Vercel Functions).
* Configure environment variables for the backend: `MONGO_URI`, `OPENAI_*`.
* Restrict CORS if exposing the API publicly (update `cors()` config).
* Ensure the frontend calls the right API base (e.g., set `VITE_API_BASE` to your public `/api` route or keep relative paths if served behind the same domain).

---

## 🧪 Troubleshooting

* **`MONGO_URI is undefined`**
  Ensure `backend/.env` exists and is loaded (the app uses `dotenv` with an explicit path). Restart `npm run dev`.

* **ECONNREFUSED (Mongo)**
  Likely connecting to localhost instead of Atlas. Use your Atlas URI.

* **LLM returns non-JSON**
  The frontend has a fallback. Check server logs for the raw `content` to adjust prompt constraints if needed.

* **CORS errors**
  In dev, Vite proxy handles it. In prod, configure `cors()` with your allowed origins.

---

## 📄 License

MIT

---

## 🙌 Acknowledgements

* OpenAI API for LLM generation
* MongoDB Atlas for managed storage
* Vite + React + MUI for a fast, modern frontend developer experience
