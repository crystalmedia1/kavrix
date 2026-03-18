const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const projects = {};

app.post('/generate', async (req, res) => {
    const { prompt, userId, existingCode } = req.body;
    const projectId = 'proj_' + Math.random().toString(36).substr(2, 9);
    
    projects[projectId] = { 
        files: { html: "GENERATING", css: "", js: "" }, 
        name: prompt.substring(0, 25), 
        userId: userId 
    };
    res.json({ projectId });

    try {
        const systemPrompt = `Je bent een senior developer. Genereer een moderne app. 
        STUUR ALTIJD EEN JSON OBJECT TERUG IN DIT FORMAAT:
        {
            "html": "volledige html code (zonder css/js erin, gebruik <link rel='stylesheet' href='style.css'> en <script src='script.js'></script>)",
            "css": "alle css styling",
            "js": "alle javascript logica"
        }
        GEEN TEKST, GEEN MARKDOWN, ALLEEN DIT JSON OBJECT. Gebruik Tailwind CDN in de HTML voor snelle styling indien nodig.`;

        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" } // We dwingen JSON af!
        }, {
            headers: { 'Authorization': `Bearer ${process.env.API_KEY}` }
        });

        const result = JSON.parse(response.data.choices[0].message.content);
        projects[projectId].files = result;
    } catch (error) {
        projects[projectId].files = { html: "<h1>Fout bij genereren</h1>", css: "", js: "" };
    }
});

app.get('/project/:id', (req, res) => {
    res.json(projects[req.params.id] || { files: null });
});

app.get('/projects/:userId', (req, res) => {
    const userProjects = Object.keys(projects)
        .filter(id => projects[id].userId === req.params.userId)
        .map(id => ({ id, name: projects[id].name }));
    res.json(userProjects);
});

app.listen(process.env.PORT || 3000);
