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
            const systemPrompt = `Senior Dev. Maak moderne app. 
            GEBRUIK: Tailwind, Lucide Icons, Google Fonts. 
            LIVE DATA: Gebruik fetch() voor gratis API's (Crypto/Weer). 
            FOTO'S: <img src="https://loremflickr.com/800/600/[TOPIC]">.
            OUTPUT: JSON {"html": "...", "css": "...", "js": "..."}`;

            let userContent = prompt;
            if (existingFiles && existingFiles.html && existingFiles.html !== "GENERATING") {
                userContent = `UPDATE CODE:\nHTML: ${existingFiles.html}\nCSS: ${existingFiles.css}\nJS: ${existingFiles.js}\n\nWIJZIGING: ${prompt}`;
            }

            const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: "mixtral-8x7b-32768", // KRACHTIGER EN STABIELER VOOR CODE
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userContent }
                ],
                temperature: 0.4, // Lager voor maximale stabiliteit
                response_format: { type: "json_object" }
            }, {
                headers: { 'Authorization': `Bearer ${process.env.API_KEY}` },
                timeout: 45000 // We geven hem 45 seconden de tijd
            });

            projects[projectId].files = JSON.parse(response.data.choices[0].message.content);
        } catch (error) {
            if (retryCount < 2) {
                console.log("Retry...");
                await generateAI(retryCount + 1);
            } else {
                projects[projectId].files = { html: "<div style='color:white;text-align:center;padding:50px;font-family:sans-serif;'><h1>KAVRIX is even aan het herstellen...</h1><p>Druk nogmaals op de Bolt-knop. De AI is momenteel erg druk.</p></div>" };
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
