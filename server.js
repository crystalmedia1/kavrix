const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const projects = {};

app.post('/generate', async (req, res) => {
    const { prompt, userId, existingFiles } = req.body;
    const projectId = 'proj_' + Math.random().toString(36).substr(2, 9);
    
    projects[projectId] = { files: { html: "GENERATING" }, name: prompt.substring(0, 20), userId: userId };
    res.json({ projectId });

    try {
        const systemPrompt = `Je bent een senior developer. Genereer een moderne app. 
        BELANGRIJK VOOR FOTO'S: Gebruik ALTIJD deze structuur voor afbeeldingen: <img src="https://loremflickr.com/800/600/[TOPIC]" alt="image">
        Vervang [TOPIC] door één Engels woord (bijv. "ferrari", "pizza", "office").
        
        STUUR ALTIJD EEN JSON OBJECT TERUG:
        {
            "html": "volledige html code",
            "css": "alle css styling",
            "js": "alle javascript logica"
        }`;

        let userContent = prompt;
        if (existingFiles && existingFiles.html) {
            userContent = `PAS DEZE CODE AAN: \nHTML: ${existingFiles.html}\nCSS: ${existingFiles.css}\nJS: ${existingFiles.js}\n\nAANPASSING: ${prompt}`;
        }

        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent }
            ],
            response_format: { type: "json_object" }
        }, {
            headers: { 'Authorization': `Bearer ${process.env.API_KEY}` }
        });

        projects[projectId].files = JSON.parse(response.data.choices[0].message.content);
    } catch (error) {
        projects[projectId].files = { html: "<h1>Fout bij genereren</h1>" };
    }
});

app.get('/project/:id', (req, res) => res.json(projects[req.params.id] || { files: null }));
app.get('/projects/:userId', (req, res) => {
    const userProjects = Object.keys(projects).filter(id => projects[id].userId === req.params.userId).map(id => ({ id, name: projects[id].name }));
    res.json(userProjects);
});

app.listen(process.env.PORT || 3000);
