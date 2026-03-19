const express = require('express');
const cors = require('cors');
const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 1. DATABASE VERBINDING (Met extra error handling voor Render)
const MONGODB_URI = process.env.MONGODB_URI;
const API_KEY = process.env.API_KEY;

if (!MONGODB_URI) {
    console.error("FOUT: MONGODB_URI ontbreekt in Environment Variables!");
}

mongoose.connect(MONGODB_URI)
    .then(() => console.log("KAVRIX Database Verbonden!"))
    .catch(err => console.error("Database Verbindingsfout:", err));

// 2. DATABASE SCHEMA
const ProjectSchema = new mongoose.Schema({
    name: { type: String, default: 'Nieuw Project' },
    userId: { type: String, default: 'user_123' },
    files: {
        html: { type: String, default: '' },
        css: { type: String, default: '' },
        js: { type: String, default: '' }
    },
    history: [{
        prompt: String,
        timestamp: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
const Project = mongoose.model('Project', ProjectSchema);

// 3. AI GENERATIE ENGINE
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

        // Achtergrond proces
        (async () => {
            try {
                const isUpdate = existingFiles && existingFiles.html && existingFiles.html !== "GENERATING";
                
                const systemPrompt = `Je bent KAVRIX PRO AI, een Senior Full-Stack Developer.
                STIJL: Modern, strak, Tailwind CSS, Lucide Icons.
                OUTPUT: Lever ALTIJD een JSON object: {"html": "...", "css": "...", "js": "..."}.
                ${isUpdate ? "Pas de bestaande code aan." : "Maak een nieuwe app."}`;

                const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: isUpdate ? `CODE: ${existingFiles.html}\n\nUPDATE: ${prompt}` : prompt }
                    ],
                    response_format: { type: "json_object" }
                }, {
                    headers: { 'Authorization': `Bearer ${API_KEY}` },
                    timeout: 60000
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

// 4. PROJECT ROUTES (Ophalen, Lijst, Verwijderen, Hernoemen)
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

// 5. EXPORT ROUTE
app.get('/export/:id', async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);
        const fullHtml = `<!DOCTYPE html><html><head><style>${project.files.css}</style></head><body>${project.files.html}<script>${project.files.js}<\/script></body></html>`;
        res.setHeader('Content-Disposition', `attachment; filename="export.html"`);
        res.send(fullHtml);
    } catch (e) { res.status(500).send("Fout"); }
});

app.get('/', (req, res) => res.send('KAVRIX Online'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server draait op ${PORT}`));
