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
    
    // Initialiseer het project in het geheugen
    projects[projectId] = { 
        files: { html: "GENERATING", css: "", js: "" }, 
        name: prompt.substring(0, 20), 
        userId: userId || "anon" 
    };
    res.json({ projectId });

    try {
        let systemPrompt = `Je bent een Senior Full-Stack Developer. Maak een moderne, functionele app.
        GEBRUIK: Tailwind CSS, Lucide Icons, Google Fonts.
        FOTO'S: Gebruik <img src="https://loremflickr.com/800/600/[TOPIC]" alt="img">.
        
        STUUR ALTIJD EEN JSON OBJECT TERUG:
        {
            "html": "volledige html code (inclusief Tailwind & Lucide CDN)",
            "css": "custom styling voor effecten",
            "js": "javascript logica"
        }`;

        let userContent = `Maak deze app: ${prompt}`;
        
        // Voeg context toe als er al bestaande code is (Edit Mode)
        if (existingFiles && existingFiles.html && existingFiles.html !== "GENERATING") {
            systemPrompt += `\n\nPAS DE BESTAANDE CODE AAN. Gebruik de oude code als basis en voer de wijziging door.`;
            userContent = `BESTAANDE HTML: ${existingFiles.html}\nBESTAANDE CSS: ${existingFiles.css}\nBESTAANDE JS: ${existingFiles.js}\n\nAANPASSING: ${prompt}`;
        }

        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile", // HET NIEUWE ONDERSTEUNDE MODEL
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent }
            ],
            temperature: 0.5,
            response_format: { type: "json_object" }
        }, {
            headers: { 'Authorization': `Bearer ${process.env.API_KEY}` },
            timeout: 30000
        });

        // Sla de gegenereerde bestanden op
        const aiResponse = JSON.parse(response.data.choices[0].message.content);
        projects[projectId].files = aiResponse;

    } catch (error) {
        console.error("AI FOUT:", error.response ? JSON.stringify(error.response.data) : error.message);
        projects[projectId].files = { 
            html: `<div style="color:white;text-align:center;padding:50px;font-family:sans-serif;">
                    <h1>Oeps! Er ging iets mis.</h1>
                    <p>${error.response ? "De AI-server gaf een foutmelding. Probeer het over een minuutje opnieuw." : "Verbindingsfout met de server."}</p>
                   </div>`, 
            css: "", 
            js: "" 
        };
    }
});

// Endpoint om de status van een project op te halen
app.get('/project/:id', (req, res) => {
    res.json(projects[req.params.id] || { files: null });
});

// Endpoint om alle projecten van een gebruiker op te halen
app.get('/projects/:userId', (req, res) => {
    const userProjects = Object.keys(projects)
        .filter(id => projects[id].userId === req.params.userId)
        .map(id => ({ id, name: projects[id].name }));
    res.json(userProjects);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`KAVRIX Engine draait op poort ${PORT}`);
});
