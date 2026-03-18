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
        let systemPrompt = `Je bent een UI/UX Designer en Senior Developer. 
        Jouw doel: Maak visueel verbluffende apps met moderne effecten.
        
        GEREEDSCHAPSKIST:
        1. Framework: Tailwind CSS (CDN).
        2. Icons: Lucide Icons (CDN: https://unpkg.com/lucide@latest). Gebruik <i data-lucide="icon-name"></i>.
        3. Fonts: Gebruik Google Fonts (bijv. Inter of Poppins).
        4. Foto's: <img src="https://loremflickr.com/800/600/[TOPIC]" alt="img">.
        5. Effecten: Glassmorphism, Neon Glow, Smooth Transitions.
        
        STUUR ALTIJD DIT JSON OBJECT:
        {
            "html": "volledige html (inclusief alle CDN links en lucide.createIcons() script onderaan)",
            "css": "custom css voor animaties en glow",
            "js": "javascript logica"
        }`;

        let userContent = `ONTWERP DIT: ${prompt}`;
        
        if (existingFiles && existingFiles.html && existingFiles.html !== "GENERATING") {
            systemPrompt += `\n\nPAS DE BESTAANDE CODE AAN. Behoud de stijl en de nieuwe gereedschappen.`;
            userContent = `BESTAANDE CODE:\nHTML: ${existingFiles.html}\nCSS: ${existingFiles.css}\nJS: ${existingFiles.js}\n\nNIEUWE OPDRACHT: ${prompt}`;
        }

        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent }
            ],
            temperature: 0.7,
            response_format: { type: "json_object" }
        }, {
            headers: { 'Authorization': `Bearer ${process.env.API_KEY}` }
        });

        projects[projectId].files = JSON.parse(response.data.choices[0].message.content);
    } catch (error) {
        projects[projectId].files = { html: "<h1>Creatieve fout... probeer het opnieuw!</h1>" };
    }
});

app.get('/project/:id', (req, res) => res.json(projects[req.params.id] || { files: null }));
app.get('/projects/:userId', (req, res) => {
    const userProjects = Object.keys(projects).filter(id => projects[id].userId === req.params.userId).map(id => ({ id, name: projects[id].name }));
    res.json(userProjects);
});

app.listen(process.env.PORT || 3000);
