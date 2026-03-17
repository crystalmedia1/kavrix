const express = require('express');
const axios = require('axios');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Helper om AI output te cleanen
function cleanCode(text) {
  if (!text) return '';
  let code = text.trim();
  code = code.replace(/```html/g, '').replace(/```/g, '').trim();
  const start = code.indexOf('<!DOCTYPE html>');
  const end = code.lastIndexOf('</html>');
  if (start !== -1 && end !== -1) {
    code = code.substring(start, end + 7);
  }
  return code;
}

// AI generate endpoint
app.post('/generate', async (req, res) => {
  const { prompt, existingCode } = req.body;

  if (!process.env.API_KEY) {
    return res.status(500).json({ error: 'API_KEY niet ingesteld.' });
  }

  const systemMessage = `Je bent een professionele full-stack developer AI.
  Bouw moderne, responsive webapps met Tailwind CSS.
  Stuur alleen de volledige HTML code terug, beginnend met <!DOCTYPE html>.
  Geen uitleg of extra tekst.`;

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemMessage },
          {
            role: 'user',
            content: existingCode
              ? `HUIDIGE CODE:\n${existingCode}\n\nPAS AAN: ${prompt}`
              : `BOUW APP: ${prompt}`,
          },
        ],
        temperature: 0.2,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const finalCode = cleanCode(response.data.choices[0].message.content);
    res.json({ code: finalCode });
  } catch (error) {
    console.error('AI Error:', error.message);
    res.status(500).json({ error: 'AI kon de code niet genereren.' });
  }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server draait op poort ${PORT}`));
