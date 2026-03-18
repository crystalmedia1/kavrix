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

    const generateAI = async () => {
        try {
            // EXTREEM COMPACTE PROMPT OM RATE LIMITS TE VOORKOMEN
            const systemPrompt = `Senior Dev. Maak moderne app. Tailwind, Lucide. Live data via fetch(). JSON: {"html": "...", "css": "...", "js": "..."}`;

            const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: "llama3-8b-8192",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: prompt }
                ],
                temperature: 0.2, // ZEER LAAG VOOR MINIMAAL TOKEN VERBRUIK
                response_format: { type: "json_object" }
            }, {
                headers: { 'Authorization': `Bearer ${process.env.API_KEY}` },
                timeout: 15000
            });

            projects[projectId].files = JSON.parse(response.data.choices[0].message.content);
        } catch (error) {
            console.error("FOUTMELDING:", error.response ? error.response.data : error.message);
            
            let errorMsg = "AI is even overbelast.";
            if (error.response && error.response.status === 429) {
                errorMsg = "Je Groq API limiet is bereikt voor vandaag. Maak een nieuwe gratis sleutel aan op console.groq.com.";
            }

            projects[projectId].files = { 
                html: `<div style='color:white;text-align:center;padding:50px;font-family:sans-serif;'>
                        <h1>${errorMsg}</h1>
                        <p>Wacht een paar minuten of vervang je API_KEY in Render.</p>
                       </div>` 
            };
        }
    };

    generateAI();
});

app.get('/project/:id', (req, res) => res.json(projects[req.params.id] || { files: null }));
app.get('/projects/:userId', (req, res) => {
    const userProjects = Object.keys(projects).filter(id => projects[id].userId === req.params.userId).map(id => ({ id, name: projects[id].name }));
    res.json(userProjects);
});

app.listen(process.env.PORT || 3000);
