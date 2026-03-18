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
            const systemPrompt = `Je bent een Senior Full-Stack Developer. Maak een moderne, FUNCTIONELE app.
            
            LIVE DATA REGELS:
            1. Gebruik 'fetch()' in de JavaScript om echte data op te halen.
            2. Gebruik GRATIS API's zonder key, zoals:
               - Crypto: https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=eur
               - Weer: https://api.open-meteo.com/v1/forecast?latitude=52.37&longitude=4.89&current_weather=true
               - Nieuws: https://ok.surf/api/v1/cors/news-feed
            
            DESIGN: Tailwind CSS, Lucide Icons, Google Fonts.
            FOTO'S: <img src="https://loremflickr.com/800/600/[TOPIC]" alt="img">.
            
            STUUR ALTIJD DIT JSON OBJECT: {"html": "...", "css": "...", "js": "..."}`;

            let userContent = prompt;
            if (existingFiles && existingFiles.html && existingFiles.html !== "GENERATING") {
                userContent = `PAS DEZE CODE AAN EN VOEG LIVE DATA TOE:\nHTML: ${existingFiles.html}\nCSS: ${existingFiles.css}\nJS: ${existingFiles.js}\n\nNIEUWE OPDRACHT: ${prompt}`;
            }

            const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: "llama3-8b-8192",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userContent }
                ],
                temperature: 0.5,
                response_format: { type: "json_object" }
            }, {
                headers: { 'Authorization': `Bearer ${process.env.API_KEY}` },
                timeout: 25000
            });

            projects[projectId].files = JSON.parse(response.data.choices[0].message.content);
        } catch (error) {
            if (retryCount < 2) {
                await generateAI(retryCount + 1);
            } else {
                projects[projectId].files = { html: "<div style='color:white;text-align:center;padding:50px;'><h1>AI is even druk...</h1><p>Probeer het opnieuw.</p></div>" };
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
