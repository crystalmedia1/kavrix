const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const projects = {};

app.post('/generate', async (req, res) => {
  const { prompt, userId } = req.body;
  const projectId = 'proj_' + Math.random().toString(36).substr(2, 9);
  projects[projectId] = { files: { html: "GENERATING" }, name: prompt.substring(0, 20), userId: userId };
  res.json({ projectId });

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: "llama3-8b-8192",
        messages: [
          { role: "system", content: "Je bent een web developer. Stuur ALTIJD een JSON object terug met de velden 'html', 'css' en 'js'." },
          { role: "user", content: "Maak deze app: " + prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.5
      },
      {
        headers: { Authorization: `Bearer ${process.env.API_KEY}` },
        timeout: 20000
      }
    );

    projects[projectId].files = response.data.choices[0].message.content;
    // response.data.choices[0].message.content is already a JSON object because of response_format
  } catch (error) {
    console.error("FOUT:", error.response ? error.response.data : error.message);
    projects[projectId].files = {
      html: `<h1 style="color:white;text-align:center;padding:50px;">Verbindingsfout: ${error.response ? JSON.stringify(error.response.data) : error.message}</h1>`,
      css: "",
      js: ""
    };
  }
});

app.get('/project/:id', (req, res) => res.json(projects[req.params.id] || { files: null }));
app.get('/projects/:userId', (req, res) => res.json([]));

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server running on port ${process.env.PORT || 3000}`);
});
