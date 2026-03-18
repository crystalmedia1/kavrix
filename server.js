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
        const systemPrompt = `Je bent een Senior Designer. Maak een moderne app.
        GEBRUIK: Tailwind CSS, Lucide Icons, Google Fonts.
        FOTO'S: <img src="https://loremflickr.com/800/600/[TOPIC]" alt="img">.
        
        STUUR ALTIJD DIT JSON OBJECT:
        {
            "html": "volledige html (inclusief Tailwind & Lucide CDN)",
            "css": "custom styling voor glow/effecten",
            "js": "javascript logica"
        }`;

        let userContent = prompt;
        if (existingFiles && existingFiles.html && existingFiles.html !== "GENERATING") {
            userContent = `PAS DEZE CODE AAN:\nHTML: ${existingFiles.html}\nCSS: ${existingFiles.css}\nJS: ${existingFiles.js}\n\nNIEUWE OPDRACHT: ${prompt}`;
        }

        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent }
            ],
            temperature: 0.6, // Iets lager voor meer stabiliteit
            response_format: { type: "json_object" }
        }, {
            headers: { 'Authorization': `Bearer ${process.env.API_KEY}` },
            timeout: 30000 // 30 seconden wachttijd
        });

        projects[projectId].files = JSON.parse(response.data.choices[0].message.content);
    } catch (error) {
        console.error("AI FOUT:", error.message);
        projects[projectId].files = { html: "<h1 style='color:white;text-align:center;margin-top:50px;'>AI is even druk... probeer het nog een keer!</h1>" };
    }
});

app.get('/project/:id', (req, res) => res.json(projects[req.params.id] || { files: null }));
app.get('/projects/:userId', (req, res) => {
    const userProjects = Object.keys(projects).filter(id => projects[id].userId === req.params.userId).map(id => ({ id, name: projects[id].name }));
    res.json(userProjects);
});

app.listen(process.env.PORT || 3000);
