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
        BELANGRIJK VOOR FOTO'S: Gebruik ALTIJD deze structuur: <img src="https://loremflickr.com/800/600/[TOPIC]" alt="image">
        Vervang [TOPIC] door één Engels woord.
        
        STUUR ALTIJD EEN JSON OBJECT TERUG:
        {
            "html": "volledige html code",
            "css": "alle css styling",
            "js": "alle javascript logica"
        }`;

        let userContent = `Opdracht: ${prompt}`;
        
        // DE CRUCIALE UPGRADE VOOR AANPASSINGEN:
        if (existingFiles && existingFiles.html && existingFiles.html !== "GENERATING") {
            systemPrompt += `\n\nJE BENT NU IN EDIT-MODE. 
            1. Gebruik de BESTAANDE CODE als basis.
            2. Voer de gevraagde AANPASSING exact uit.
            3. Behoud de rest van de structuur en styling.
            4. Zorg dat de <img> tags de juiste nieuwe [TOPIC] krijgen.`;
            
            userContent = `--- BESTAANDE CODE ---
            HTML: ${existingFiles.html}
            CSS: ${existingFiles.css}
            JS: ${existingFiles.js}
            
            --- GEWENSTE AANPASSING ---
            ${prompt}`;
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
