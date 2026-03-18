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
        code: "GENERATING", 
        name: prompt.length > 25 ? prompt.substring(0, 25) + "..." : prompt, 
        userId: userId 
    };
    res.json({ projectId });

    try {
        const systemPrompt = existingCode 
            ? "Je bent een expert developer. Pas de BESTAANDE code aan op basis van de vraag van de gebruiker. Geef ALLEEN de volledige nieuwe HTML code terug. Geen tekst, geen uitleg. Geen markdown code blocks."
            : "Je bent een expert developer. Genereer een volledige HTML/CSS/JS app in één bestand. Gebruik Tailwind CSS. Geen tekst, alleen code. Geen markdown code blocks.";

        const userContent = existingCode 
            ? `BESTAANDE CODE:\n${existingCode}\n\nAANPASSING: ${prompt}`
            : `Maak deze app: ${prompt}`;

        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent }
            ],
            temperature: 0.6
        }, {
            headers: { 
                'Authorization': `Bearer ${process.env.API_KEY}`, 
                'Content-Type': 'application/json' 
            }
        });

        let code = response.data.choices[0].message.content;
        
        // Schoon de code op (verwijder markdown en tekst)
        code = code.replace(/```html/g, "").replace(/```/g, "").trim();
        if (code.includes("<​!DOCTYPE html>")) {
            code = code.substring(code.indexOf("<​!DOCTYPE html>"));
        }
        if (code.includes("<​/html>")) {
            code = code.substring(0, code.indexOf("<​/html>") + 7);
        }

        projects[projectId].code = code;
    } catch (error) {
        console.error("AI Error:", error);
        projects[projectId].code = "<h1>Fout bij genereren. Controleer je API key op Render.</h1>";
    }
});

app.get('/project/:id', (req, res) => {
    res.json(projects[req.params.id] || { code: "NOT_FOUND" });
});

app.get('/projects/:userId', (req, res) => {
    const userProjects = Object.keys(projects)
        .filter(id => projects[id].userId === req.params.userId)
        .map(id => ({ id, name: projects[id].name }));
    res.json(userProjects);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kavrix Smart Engine live op poort ${PORT}`));
