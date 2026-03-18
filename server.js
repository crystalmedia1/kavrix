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
    
    projects[projectId] = { 
        files: { html: "GENERATING", css: "", js: "" }, 
        name: prompt.substring(0, 25), 
        userId: userId 
    };
    res.json({ projectId });

    try {
        let systemPrompt = `Je bent een senior developer. Genereer een moderne app. 
        BELANGRIJK VOOR AFBEELDINGEN: Gebruik ALTIJD deze URL structuur voor <img> tags: 
        https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80
        OF gebruik voor specifieke onderwerpen:
        https://source.unsplash.com/featured/800x600?[TOPIC]
        Vervang [TOPIC] door een Engels woord (bijv. "car", "watch").
        
        STUUR ALTIJD EEN JSON OBJECT TERUG:
        {
            "html": "volledige html code (gebruik <link rel='stylesheet' href='style.css'> en <script src='script.js'></script>)",
            "css": "alle css styling",
            "js": "alle javascript logica"
        }`;

        let userContent = `Maak deze app: ${prompt}`;
        
        if (existingFiles && existingFiles.html) {
            systemPrompt += `\nPas de BESTAANDE code aan op basis van de vraag.`;
            userContent = `BESTAANDE HTML: ${existingFiles.html}\nBESTAANDE CSS: ${existingFiles.css}\nBESTAANDE JS: ${existingFiles.js}\n\nAANPASSING: ${prompt}`;
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
        console.error("AI FOUT:", error.message);
        projects[projectId].files = { html: "<h1>Fout bij genereren</h1>", css: "", js: "" };
    }
});

app.get('/project/:id', (req, res) => res.json(projects[req.params.id] || { files: null }));
app.get('/projects/:userId', (req, res) => {
    const userProjects = Object.keys(projects)
        .filter(id => projects[id].userId === req.params.userId)
        .map(id => ({ id, name: projects[id].name }));
    res.json(userProjects);
});

app.listen(process.env.PORT || 3000);
