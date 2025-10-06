import axios from 'axios';

const API_URL = 'http://192.168.1.170:3001/api';
let trainingData = [];

// Funzione per verificare se una domanda è ripetuta
function isRepeated(question, previousQuestions) {
  return previousQuestions.includes(question);
}

// Funzione per verificare se le opzioni sono distinte
function areOptionsDistinct(options) {
  if (typeof options === 'string') return true; // Per 'text-area'
  const uniqueOptions = new Set(options);
  return uniqueOptions.size === options.length;
}

export function evaluateQuestion(question, options, state, previousQuestions) {
  let questionReward = 0;
  let optionsReward = 0;

  if (question.length > 10 && question.length < 50) questionReward += 1;
  if (state.budget === '0-1k €' && !question.toLowerCase().includes('costo') && !question.toLowerCase().includes('semplice')) questionReward -= 1;
  if (state.service.toLowerCase() === 'logo' && question.toLowerCase().includes('logo')) questionReward += 1;
  if (isRepeated(question, previousQuestions)) questionReward -= 1;

  if (options === 'text-area') {
    optionsReward += 1;
  } else if (Array.isArray(options) && areOptionsDistinct(options)) {
    optionsReward += 1;
    if (question.toLowerCase().includes('colore') && options.length === 1 && options[0] === 'Non lo so') {
      optionsReward += 1;
    } else if (question.toLowerCase().includes('colore') && options.length > 1) {
      optionsReward -= 1;
    } else if (options.length === 4) {
      optionsReward -= 1;
    }
  }

  return questionReward + optionsReward;
}

export async function saveTrainingData(state, question, options, questionReward, optionsReward) {
  try {
    const response = await axios.put(`${API_URL}/update-training-data`, {
      state,
      question,
      options,
      questionReward,
      optionsReward,
      timestamp: new Date(),
    });
    console.log('Training data updated in MongoDB:', response.data);
  } catch (error) {
    console.error('Errore salvataggio su MongoDB:', error.response ? error.response.data : error.message);
  }
}

export async function getTrainingData() {
  try {
    const response = await axios.get(`${API_URL}/get-training-data`);
    trainingData = response.data.data;
    return response.data.data;
  } catch (error) {
    console.error('Errore recupero dati:', error.response ? error.response.data : error.message);
    return trainingData;
  }
}