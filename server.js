const express = require('express');
const cors = require('cors');
const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const MONGODB_URI = process.env.MONGODB_URI;
const API_KEY = process.env.API_KEY;

mongoose.connect(MONGODB_URI || 'mongodb://localhost/kavrix')
    .then(() => console.log("KAVRIX Database Verbonden!"))
    .catch(err => console.error("Database Verbindingsfout:", err));

const ProjectSchema = new mongoose.Schema({
    name: { type: String, default: 'Nieuw Project' },
    userId: { type: String, default: 'user_123' },
    files: {
        html: { type: String, default: '' },
        css: { type: String, default: '' },
        js: { type: String, default: '' }
    },
    history: [{ prompt: String, timestamp: { type: Date, default: Date.now } }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
const Project = mongoose.model('Project', ProjectSchema);

app.post('/generate', async (req, res) => {
    const { prompt, userId, existingFiles, projectId } = req.body;
    try {
        let project;
        if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
            project = await Project.findById(projectId);
        }
        if (!project) {
            project = new Project({
                name: prompt.substring(0, 30),
                userId: userId || "user_123",
                files: { html: "GENERATING", css: "", js: "" }
            });
            await project.save();
        }
        res.json({ projectId: project._id });

        (async () => {
            try {
                const isUpdate = existingFiles && existingFiles.html && existingFiles.html !== "GENERATING";
                const systemPrompt = `Je bent KAVRIX PRO AI. 
                STIJL: Modern, Luxe, Tailwind CSS.
                AFBEELDINGEN: Als de gebruiker om een foto vraagt (zoals een biefstuk), MOET je een <img> tag gebruiken of CSS background.
                GEBRUIK DEZE URL: https://image.pollinations.ai/prompt/[BESCHRIJVING]?width=1080&height=1920&nologo=true
                Vervang [BESCHRIJVING] door Engelse woorden met underscores.
                BELANGRIJK: Zorg dat de afbeelding ALTIJD zichtbaar is. Gebruik 'object-cover' voor img tags.
                OUTPUT: Lever ALTIJD een JSON object: {"html": "...", "css": "...", "js": "..."}.`;

                const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: isUpdate ? `WIJZIG DEZE CODE:\nHTML: ${existingFiles.html}\nPROMPT: ${prompt}` : prompt }
                    ],
                    response_format: { type: "json_object" }
                }, {
                    headers: { 'Authorization': `Bearer ${API_KEY}` },
                    timeout: 50000
                });

                const aiResponse = JSON.parse(response.data.choices[0].message.content);
                await Project.findByIdAndUpdate(project._id, { 
                    files: aiResponse,
                    $push: { history: { prompt: prompt } },
                    updatedAt: new Date()
                });
            } catch (err) {
                console.error("AI Fout:", err.message);
            }
        })();
    } catch (e) {
        res.status(500).json({ error: "Server Fout" });
    }
});

app.get('/project/:id', async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);
        res.json(project);
    } catch (e) { res.status(404).json({ error: "Niet gevonden" }); }
});

app.get('/projects/:userId', async (req, res) => {
    try {
        const projects = await Project.find({ userId: req.params.userId }).sort({ updatedAt: -1 });
        res.json(projects.map(p => ({ id: p._id, name: p.name })));
    } catch (e) { res.json([]); }
});

app.delete('/project/:id', async (req, res) => {
    try {
        await Project.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Fout" }); }
});

app.patch('/project/:id', async (req, res) => {
    try {
        const { name } = req.body;
        await Project.findByIdAndUpdate(req.params.id, { name, updatedAt: new Date() });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Fout" }); }
});

app.get('/export/:id', async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);
        const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${project.name}</title><script src="https://cdn.tailwindcss.com"><\/script><script src="https://unpkg.com/lucide@latest"><\/script><style>${project.files.css}</style></head><body class="bg-slate-900 text-white">${project.files.html}<script>lucide.createIcons(); ${project.files.js}<\/script></body></html>`;
        res.setHeader('Content-Disposition', `attachment; filename="${project.name.replace(/\s+/g, '_')}.html"`);
        res.setHeader('Content-Type', 'text/html');
        res.send(fullHtml);
    } catch (e) { res.status(500).send("Fout"); }
});

app.get('/', (req, res) => res.send('KAVRIX Online'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server draait op ${PORT}`));
