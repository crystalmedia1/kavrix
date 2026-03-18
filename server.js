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
        // We maken de instructies weer "vrijer" en creatiever
        let systemPrompt = `Je bent een UI/UX Designer en Senior Developer. 
        Jouw doel: Maak visueel verbluffende apps met moderne effecten zoals glassmorphism, neon glow, animaties en vette schaduwen.
        
        REGELS:
        1. Gebruik Tailwind CSS voor snelle, mooie styling.
        2. Voor foto's: <img src="https://loremflickr.com/800/600/[TOPIC]" alt="img"> (Vervang [TOPIC] door 1 Engels woord).
        3. Luister EXACT naar de stijl-beschrijving van de gebruiker (bijv. "glow", "dark mode", "minimalistisch").
        
        STUUR ALTIJD DIT JSON OBJECT:
        {
            "html": "volledige html (inclusief Tailwind CDN link)",
            "css": "extra custom css voor effecten zoals glow",
            "js": "javascript logica"
        }`;

        let userContent = `ONTWERP DIT: ${prompt}`;
        
        if (existingFiles && existingFiles.html && existingFiles.html !== "GENERATING") {
            systemPrompt += `\n\nPAS DE BESTAANDE CODE AAN. Behoud de vette styling maar voer de nieuwe wijziging door.`;
            userContent = `BESTAANDE CODE:\nHTML: ${existingFiles.html}\nCSS: ${existingFiles.css}\nJS: ${existingFiles.js}\n\nNIEUWE OPDRACHT: ${prompt}`;
        }

        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile", // Dit is het snelste en krachtigste model
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent }
            ],
            temperature: 0.7, // Dit maakt de AI weer creatiever in plaats van robotachtig
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
