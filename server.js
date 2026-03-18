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
    
    // We slaan de naam op van wat de gebruiker vroeg
    projects[projectId] = { 
        code: "GENERATING", 
        name: prompt.length > 20 ? prompt.substring(0, 20) + "..." : prompt, 
        userId: userId 
    };
    res.json({ projectId });

    try {
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile",
            messages: [
                { 
                    role: "system", 
                    content: "Je bent een expert web developer. Genereer ALTIJD een volledige, werkende HTML/CSS/JS code in één enkel bestand. Gebruik Tailwind CSS voor styling. Geef NOOIT tekst, uitleg of introductie. Geef DIRECT de code die begint met <!DOCTYPE html>. Gebruik GEEN markdown code blocks (dus geen ```html of ```)." 
                },
                { role: "user", content: "Maak deze app: " + prompt }
            ],
            temperature: 0.7
        }, {
            headers: { 
                'Authorization': `Bearer ${process.env.API_KEY}`, 
                'Content-Type': 'application/json' 
            }
        });

        let code = response.data.choices[0].message.content;
        
        // Extra beveiliging om tekst buiten de HTML te verwijderen
        if (code.includes("<​!DOCTYPE html>")) {
            code = code.substring(code.indexOf("<​!DOCTYPE html>"));
        }
        if (code.includes("<​/html>")) {
            code = code.substring(0, code.indexOf("<​/html>") + 7);
        }

        projects[projectId].code = code;
    } catch (error) {
        console.error("AI Error:", error);
        projects[projectId].code = "<html><body style='background:#0f172a;color:white;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;'><div><h1>Oeps!</h1><p>De AI-motor is even oververhit. Probeer het over een minuutje weer.</p></div></body></html>";
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
app.listen(PORT, () => console.log(`Kavrix Engine draait op poort ${PORT}`));
