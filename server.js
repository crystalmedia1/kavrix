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

    const generateAI = async (retryCount = 0) => {
        try {
            // EXTREEM KORTE INSTRUCTIES VOOR MAXIMALE SNELHEID
            const systemPrompt = `Senior Dev. Maak moderne app. 
            GEBRUIK: Tailwind, Lucide Icons. 
            LIVE DATA: Gebruik fetch() voor crypto/weer API's. 
            FOTO'S: <img src="https://loremflickr.com/800/600/[TOPIC]">.
            OUTPUT: JSON {"html": "...", "css": "...", "js": "..."}`;

            let userContent = prompt;
            if (existingFiles && existingFiles.html && existingFiles.html !== "GENERATING") {
                userContent = `UPDATE CODE:\nHTML: ${existingFiles.html}\nWIJZIGING: ${prompt}`;
            }

            const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: "llama3-8b-8192", // We gaan terug naar het allersnelste model
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userContent }
                ],
                temperature: 0.3, // Zeer laag voor directe, stabiele code
                response_format: { type: "json_object" }
            }, {
                headers: { 'Authorization': `Bearer ${process.env.API_KEY}` },
                timeout: 20000 // Snelle timeout van 20 seconden
            });

            projects[projectId].files = JSON.parse(response.data.choices[0].message.content);
        } catch (error) {
            if (retryCount < 1) {
                await generateAI(retryCount + 1);
            } else {
                projects[projectId].files = { html: "<div style='color:white;text-align:center;padding:50px;'><h1>AI is even druk...</h1><p>Wacht 5 seconden en druk nogmaals op de Bolt-knop.</p></div>" };
            }
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
