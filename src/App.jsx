import { useState } from 'react';
import { Button, TextField, Select, MenuItem, Typography, CircularProgress, Box, FormControlLabel, Checkbox, Container, Stack, Paper, Divider } from '@mui/material';
import { generateAndFilterQuestions } from './services/llm';
import { saveTrainingData } from './rl/model';


function App() {
  const [formData, setFormData] = useState({
    service: 'Logo',
    brandNameKnown: true,
    brandName: '',
    isRestyling: false,
    industry: 'Tech',
    budget: '1-5k €',
    customIndustry: '',
  });
  const [questions, setQuestions] = useState([]);
  const [ratings, setRatings] = useState({ questions: {}, options: {} }); // Stato per i voti
  const [additionalInputs, setAdditionalInputs] = useState({}); // Stato per i TextField delle risposte
  const [loading, setLoading] = useState(false);

  const requiresBrandFields = ['BRANDING', 'WEB', 'APP'];
  const serviceMacroAreas = {
    'Logo': 'BRANDING',
    'Brand Identity': 'BRANDING',
    'Packaging': 'BRANDING',
    'Content Creation': 'SOCIAL',
    'Social Media Management': 'SOCIAL',
    'Advertising': 'SOCIAL',
    'Product Photography': 'PHOTO',
    'Fashion Photography': 'PHOTO',
    'Event Photography': 'PHOTO',
    'Promo Video': 'VIDEO',
    'Corporate Video': 'VIDEO',
    'Motion Graphics': 'VIDEO',
    'Website Design': 'WEB',
    'E-commerce': 'WEB',
    'Landing Page': 'WEB',
    'Mobile app': 'APP',
    'Web app': 'APP',
    'UX/UI Design': 'APP',
  };

  const handleGenerate = async () => {
    setLoading(true);
    setAdditionalInputs({});
    setRatings({ questions: {}, options: {} });
    const startTime = Date.now();
    try {
      const filteredQuestions = await generateAndFilterQuestions(formData);
      setQuestions(filteredQuestions);
    } catch (error) {
      console.error('Errore generazione:', error);
      setQuestions([{ question: 'Errore, riprova', options: ['N/A'] }]);
    }
    setLoading(false);
    console.log(`Tempo totale: ${(Date.now() - startTime) / 1000} secondi`);
  };

  const handleRating = (question, type, rating) => {
    setRatings((prev) => {
      const newRatings = { ...prev };
      newRatings[type][question] = rating; // Sovrascrive il voto precedente
      console.log(`${type} rating aggiornato:`, newRatings);
      return newRatings;
    });
  };

  const handleAdditionalInputChange = (question, value) => {
    setAdditionalInputs((prev) => ({
      ...prev,
      [question]: value,
    }));
  };

  const handleSubmit = async () => {
  setLoading(true);
  try {
    let ok = 0, ko = 0;
    for (const q of questions) {
      const question = q.question;
      const options = q.options || [];
      const questionReward = ratings.questions[question];
      const optionsReward = ratings.options[question];

      // Salva solo se almeno uno dei due è stato votato
      if (questionReward !== undefined || optionsReward !== undefined) {
        try {
          await saveTrainingData(formData, question, options, questionReward ?? 0, optionsReward ?? 0);
          ok++;
        } catch {
          ko++;
        }
      }
    }
    alert(`Valutazioni inviate.\nSuccessi: ${ok}\nErrori: ${ko}`);
    if (ok > 0) {
      setQuestions([]);
      setRatings({ questions: {}, options: {} });
      setAdditionalInputs({});
    }
  // eslint-disable-next-line no-unused-vars
  } catch (e) {
    alert("Errore durante l'invio delle valutazioni.");
  } finally {
    setLoading(false);
  }
};


  const isBrandFieldRequired = requiresBrandFields.includes(serviceMacroAreas[formData.service]);

  return (
  <Container maxWidth="lg" sx={{ py: 4 }}>
    <Typography variant="h4" sx={{ mb: 3, fontWeight: 700 }}>
      RL Question Generator
    </Typography>

    {/* Toolbar responsive */}
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={1}
      useFlexGap
      flexWrap="wrap"
      sx={{ mb: 3 }}
    >
      <Select value={formData.service} onChange={(e) => setFormData({ ...formData, service: e.target.value })} sx={{ minWidth: 180 }} >
        <MenuItem value="Logo">Logo</MenuItem>
        <MenuItem value="Brand Identity">Brand Identity</MenuItem>
        <MenuItem value="Packaging">Packaging</MenuItem>
        <MenuItem value="Content Creation">Content Creation</MenuItem>
        <MenuItem value="Social Media Management">Social Media Management</MenuItem>
        <MenuItem value="Advertising">Advertising</MenuItem>
        <MenuItem value="Product Photography">Product Photography</MenuItem>
        <MenuItem value="Fashion Photography">Fashion Photography</MenuItem>
        <MenuItem value="Event Photography">Event Photography</MenuItem>
        <MenuItem value="Promo Video">Promo Video</MenuItem>
        <MenuItem value="Corporate Video">Corporate Video</MenuItem>
        <MenuItem value="Motion Graphics">Motion Graphics</MenuItem>
        <MenuItem value="Website Design">Website Design</MenuItem>
        <MenuItem value="E-commerce">E-commerce</MenuItem>
        <MenuItem value="Landing Page">Landing Page</MenuItem>
        <MenuItem value="Mobile app">Mobile app</MenuItem>
        <MenuItem value="Web app">Web app</MenuItem>
        <MenuItem value="UX/UI Design">UX/UI Design</MenuItem>
      </Select>

      {isBrandFieldRequired && (
        <>
          <Select value={formData.brandNameKnown} onChange={(e) => setFormData({ ...formData, brandNameKnown: e.target.value })} sx={{ minWidth: 180 }}>
            <MenuItem value={true}>Sì, so il nome</MenuItem>
            <MenuItem value={false}>No, non lo so</MenuItem>
          </Select>

          {formData.brandNameKnown && (
            <TextField
              label="Nome del brand"
              value={formData.brandName}
              onChange={(e) => setFormData({ ...formData, brandName: e.target.value })}
              sx={{ minWidth: 240 }}
            />
          )}

          <Select value={formData.isRestyling} onChange={(e) => setFormData({ ...formData, isRestyling: e.target.value })} sx={{ minWidth: 180 }}>
            <MenuItem value={false}>Progetto nuovo</MenuItem>
            <MenuItem value={true}>Restyling</MenuItem>
          </Select>
        </>
      )}

      <Select value={formData.industry} onChange={(e) => setFormData({ ...formData, industry: e.target.value })} sx={{ minWidth: 180 }}>
        <MenuItem value="Tech">Tech</MenuItem>
        <MenuItem value="Food">Food</MenuItem>
        <MenuItem value="Shop">Shop</MenuItem>
        <MenuItem value="Servizi">Servizi</MenuItem>
        <MenuItem value="Produzione">Produzione</MenuItem>
        <MenuItem value="Eventi">Eventi</MenuItem>
        <MenuItem value="Fashion">Fashion</MenuItem>
        <MenuItem value="Altro">Altro</MenuItem>
      </Select>

      {formData.industry === 'Altro' && (
        <TextField
          label="Inserisci il tuo ambito"
          value={formData.customIndustry}
          onChange={(e) => setFormData({ ...formData, customIndustry: e.target.value })}
          sx={{ minWidth: 240 }}
        />
      )}

      <Select value={formData.budget} onChange={(e) => setFormData({ ...formData, budget: e.target.value })} sx={{ minWidth: 160 }}>
        <MenuItem value="non lo so">Non lo so</MenuItem>
        <MenuItem value="0-1k €">0-1k €</MenuItem>
        <MenuItem value="1-5k €">1-5k €</MenuItem>
        <MenuItem value="5-10k €">5-10k €</MenuItem>
        <MenuItem value="10k+ €">10k+ €</MenuItem>
      </Select>

      <Button variant="contained" onClick={handleGenerate} disabled={loading}>
        Genera Domande
      </Button>
    </Stack>

    {loading ? (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    ) : (
      questions.length > 0 && (
        <Stack spacing={2}>
          {questions.map((q, idx) => (
            <Paper key={idx} variant="outlined" sx={{ p: 2 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                {q.question}
              </Typography>

              {q.options === 'text-area' ? (
                <TextField
                  label="Rispondi qui (es. 'Non so, fate proposte voi')"
                  fullWidth
                  multiline
                  rows={3}
                  value={additionalInputs[q.question] || ''}
                  onChange={(e) => handleAdditionalInputChange(q.question, e.target.value)}
                  sx={{ mb: 2 }}
                />
              ) : (
                <Box>
                  {q.question.toLowerCase().includes('colore') ? (
                    <FormControlLabel control={<Checkbox />} label="Non lo so" sx={{ mb: 1 }} />
                  ) : (
                    q.options.map((opt, optIdx) => (
                      <FormControlLabel
                        key={optIdx}
                        control={<Checkbox />}
                        label={opt}
                        sx={{ display: 'block', mb: 0.5 }}
                      />
                    ))
                  )}
                  {q['text-area'] && (
                    <TextField
                      label="Aggiungi dettagli o specifica altro"
                      fullWidth
                      multiline
                      rows={3}
                      value={additionalInputs[q.question] || ''}
                      onChange={(e) => handleAdditionalInputChange(q.question, e.target.value)}
                      sx={{ mt: 1 }}
                    />
                  )}
                </Box>
              )}

              <Divider sx={{ my: 2, opacity: 0.2 }} />

              <Box sx={{ mb: 2 }}>
                <Typography sx={{ mb: 1 }}>Valuta la domanda:</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Button onClick={() => handleRating(q.question, 'questions', 1)} variant={ratings.questions[q.question] === 1 ? 'contained' : 'outlined'} size="small">
                    Buona (+1)
                  </Button>
                  <Button onClick={() => handleRating(q.question, 'questions', 0)} variant={ratings.questions[q.question] === 0 ? 'contained' : 'outlined'} size="small">
                    Ok (0)
                  </Button>
                  <Button onClick={() => handleRating(q.question, 'questions', -1)} variant={ratings.questions[q.question] === -1 ? 'contained' : 'outlined'} size="small">
                    Scarta (-1)
                  </Button>
                </Stack>
                <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>
                  Rating: {ratings.questions[q.question] ?? 'Non valutata'}
                </Typography>
              </Box>

              <Box>
                <Typography sx={{ mb: 1 }}>Valuta le opzioni:</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Button onClick={() => handleRating(q.question, 'options', 1)} variant={ratings.options[q.question] === 1 ? 'contained' : 'outlined'} size="small">
                    Buone (+1)
                  </Button>
                  <Button onClick={() => handleRating(q.question, 'options', 0)} variant={ratings.options[q.question] === 0 ? 'contained' : 'outlined'} size="small">
                    Ok (0)
                  </Button>
                  <Button onClick={() => handleRating(q.question, 'options', -1)} variant={ratings.options[q.question] === -1 ? 'contained' : 'outlined'} size="small">
                    Scarta (-1)
                  </Button>
                </Stack>
                <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>
                  Rating: {ratings.options[q.question] ?? 'Non valutate'}
                </Typography>
              </Box>
            </Paper>
          ))}

          <Box sx={{ textAlign: 'right' }}>
            <Button variant="contained" color="primary" onClick={handleSubmit} disabled={loading}>
              Invia Valutazioni
            </Button>
          </Box>
        </Stack>
      )
    )}
  </Container>
);
}

export default App;