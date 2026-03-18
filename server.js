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
    projects[projectId] = { files: { html: "GENERATING" }, name: "Test", userId: userId };
    res.json({ projectId });

    try {
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama3-8b-8192",
            messages: [{ role: "user", content: "Maak een simpele HTML pagina: " + prompt }],
            temperature: 0.5
        }, {
            headers: { 'Authorization': `Bearer ${process.env.API_KEY}` },
            timeout: 10000
        });

        const content = response.data.choices[0].message.content;
        projects[projectId].files = { html: content, css: "", js: "" };
    } catch (error) {
        console.error("FOUT:", error.message);
        projects[projectId].files = { html: "<h1>AI Verbindingsfout: " + error.message + "<​/h1>" };
    }
});

app.get('/project/:id', (req, res) => res.json(projects[req.params.id] || { files: null }));
app.get('/projects/:userId', (req, res) => res.json([]));
app.listen(process.env.PORT || 3000);
