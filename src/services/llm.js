// src/services/llm.js
import axios from "axios";
import { evaluateQuestion } from "../rl/model";

// 👉 Chiave rimossa: ora il frontend non contiene più segreti!
//    Tutte le chiamate a OpenAI passeranno dal backend.

async function callBackendLLM(prompt) {
  // Legge la base URL dal file .env (VITE_API_BASE) o usa '/api' di default
  const baseUrl = import.meta.env.VITE_API_BASE || '/api';
  const response = await axios.post(`${baseUrl}/generate-questions`, { prompt });
  return response.data.content; // il backend restituisce "content"
}

async function generateRawQuestions({
  service,
  brandNameKnown,
  brandName,
  isRestyling,
  industry,
  customIndustry,
}) {
  const actualIndustry =
    industry === "Altro" ? customIndustry || "Altro" : industry;

  const servicesDescription = `
    L'agenzia offre i seguenti servizi ai propri clienti:
    - BRANDING: Logo (creazione di loghi per brand), Brand Identity (sviluppo dell'identità visiva), Packaging (design di packaging per prodotti).
    - SOCIAL: Content Creation (creazione di contenuti per social media), Social Media Management (gestione dei profili social), Advertising (campagne pubblicitarie sui social).
    - PHOTO: Product Photography (fotografia di prodotti), Fashion Photography (fotografia di moda), Event Photography (fotografia di eventi).
    - VIDEO: Promo Video (video promozionali), Corporate Video (video istituzionali), Motion Graphics (animazioni grafiche).
    - WEB: Website Design (progettazione siti web), E-commerce (sviluppo di piattaforme e-commerce), Landing Page (creazione di landing page).
    - APP: Mobile app (sviluppo app mobili), Web app (sviluppo app web), UX/UI Design (design dell'esperienza utente e interfaccia).
    Le domande devono essere pertinenti alla fornitura di questi servizi ai clienti, non all'uso finale da parte dell'utente (es. per E-commerce, domande su design o gestione, non su shopping).
  `;

  const prompt = `
    ${servicesDescription}
    Genera 10 domande uniche per il servizio '${service}' nel formato JSON seguente:
    [
      { "question": "Testo della domanda", "options": ["Opzione A", "Opzione B", "Opzione C", "Opzione D"], "text-area": true },
      { "question": "Testo della domanda", "options": "text-area" }
    ]
    - Genera un mix di domande: alcune a scelta multipla e altre solo con risposte aperte ("text-area").
    - Ogni domanda a scelta multipla DEVE AVERE 4 opzioni.
    - Per la domanda sui colori usa: { "question": "Quali sono le tue preferenze di colore?", "options": ["Non lo so"], "text-area": true }.
    - L'utente ${
      brandNameKnown
        ? `sa già il nome del brand${brandName ? ` ed è "${brandName}"` : ""}`
        : "non ha un nome del brand"
    }.
    - È un ${isRestyling ? "restyling" : "progetto nuovo"}.
    - Ambito: ${actualIndustry}.
    - Non generare domande sul budget.
    - Restituisci SOLO il JSON, senza testo aggiuntivo.
  `;

  try {
    const rawContent = await callBackendLLM(prompt); // chiama il backend
    console.log("Raw API response:", rawContent);

    let questions;
    try {
      questions = JSON.parse(rawContent);
    } catch (parseError) {
      console.error("Errore parsing JSON:", parseError.message);
      return getFallbackQuestions(service);
    }

    // Aggiusta le domande per garantire "text-area": true e 4 opzioni
    const adjustedQuestions = questions.map((q) => {
      if (Array.isArray(q.options) && q.options[0] !== "Non lo so") {
        q["text-area"] = true;
        while (q.options.length < 4) {
          q.options.push(`Altra opzione ${q.options.length + 1}`);
        }
        if (q.options.length > 4) {
          q.options = q.options.slice(0, 4);
        }
      }
      return q;
    });

    return adjustedQuestions;
  } catch (error) {
    console.error("Errore API backend:", error.message);
    return getFallbackQuestions(service);
  }
}

function getFallbackQuestions(service) {
  return [
    {
      question: `Che stile preferisci per il tuo ${service.toLowerCase()}?`,
      options: ["Minimalista", "Moderno", "Vintage", "Illustrativo"],
      "text-area": true,
    },
    {
      question: "Quali valori vuoi trasmettere con questo progetto?",
      options: ["Innovazione", "Sostenibilità", "Qualità", "Creatività"],
      "text-area": true,
    },
    {
      question: "Quali sono le tue preferenze di colore?",
      options: ["Non lo so"],
      "text-area": true,
    },
    {
      question: `Il ${service.toLowerCase()} deve essere adattabile a diverse dimensioni?`,
      options: ["Sì", "No", "Entrambi", "Non so"],
      "text-area": true,
    },
    {
      question: "Quanto è importante la riconoscibilità?",
      options: ["Molto", "Abbastanza", "Poco", "Non so"],
      "text-area": true,
    },
    {
      question: "Preferisci un design formale o informale?",
      options: ["Formale", "Informale", "Casual", "Non so"],
      "text-area": true,
    },
    {
      question: "Vuoi includere un'icona o solo testo?",
      options: ["Icona", "Solo testo", "Entrambi", "Non so"],
      "text-area": true,
    },
    {
      question: "Quale emozione vuoi suscitare?",
      options: ["Affidabilità", "Innovazione", "Sicurezza", "Creatività"],
      "text-area": true,
    },
    {
      question: "Hai preferenze sulla disposizione degli elementi?",
      options: ["Testo a sinistra", "Testo sopra", "Integrato", "Non so"],
      "text-area": true,
    },
    {
      question: "Quanto è importante distinguerti dalla concorrenza?",
      options: ["Molto", "Abbastanza", "Poco", "Non so"],
      "text-area": true,
    },
  ];
}

export async function generateAndFilterQuestions(formData) {
  const startTime = Date.now();
  const rawQuestions = await generateRawQuestions(formData);
  console.log("Raw API response:", rawQuestions);
  const previousQuestions = new Set();
  const filteredQuestions = [];

  if (formData.service === "Logo") {
    const colorQuestion = {
      question: "Quali sono le tue preferenze di colore?",
      options: ["Non lo so"],
      "text-area": true,
    };
    const fontQuestion = {
      question: "Quale tipo di font preferisci? (es. serif, sans-serif, ecc.)",
      options: ["Serif", "Sans-serif", "Script", "Non so"],
      "text-area": true,
    };
    if (!rawQuestions.some((q) => q.question === colorQuestion.question)) {
      filteredQuestions.push(colorQuestion);
      previousQuestions.add(colorQuestion.question);
    }
    if (!rawQuestions.some((q) => q.question === fontQuestion.question)) {
      filteredQuestions.push(fontQuestion);
      previousQuestions.add(fontQuestion.question);
    }
  }

  for (const q of rawQuestions) {
    if (!previousQuestions.has(q.question)) {
      const reward = evaluateQuestion(
        q.question,
        q.options,
        formData,
        Array.from(previousQuestions)
      );
      console.log(
        `Domanda: "${q.question}", Reward: ${reward}, Options: ${JSON.stringify(
          q.options
        )}, Text-area: ${q["text-area"]}`
      );
      if (reward > 0) {
        filteredQuestions.push(q);
        previousQuestions.add(q.question);
      }
    }
    if (filteredQuestions.length >= 10) break;
  }

  const result =
    filteredQuestions.length >= 10
      ? filteredQuestions
      : rawQuestions.slice(0, 10);
  console.log(
    `Filtraggio completato in: ${(Date.now() - startTime) / 1000} secondi`
  );
  return result;
}
