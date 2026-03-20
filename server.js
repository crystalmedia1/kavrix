const express = require('express');
const cors = require('cors');
const axios = require('axios');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const MONGODB_URI = process.env.MONGODB_URI;
const API_KEY = process.env.API_KEY;

mongoose.connect(MONGODB_URI)
    .then(() => console.log("KAVRIX Database Verbonden!"))
    .catch(err => console.error("Database Verbindingsfout:", err));

// GEBRUIKER SCHEMA
const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

// PROJECT SCHEMA
const ProjectSchema = new mongoose.Schema({
    name: { type: String, default: 'Nieuw Project' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    files: { html: { type: String, default: '' }, css: { type: String, default: '' }, js: { type: String, default: '' } },
    updatedAt: { type: Date, default: Date.now }
});
const Project = mongoose.model('Project', ProjectSchema);

// --- AUTH ROUTES ---
app.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ email, password: hashedPassword });
        await user.save();
        res.json({ userId: user._id });
    } catch (e) { res.status(400).json({ error: "Email bestaat al" }); }
});

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ error: "Ongeldige gegevens" });
        }
        res.json({ userId: user._id });
    } catch (e) { res.status(500).json({ error: "Server fout" }); }
});

// --- APP ROUTES ---
app.post('/generate', async (req, res) => {
    const { prompt, userId, projectId } = req.body;
    try {
        let project;
        if (projectId && mongoose.Types.ObjectId.isValid(projectId)) project = await Project.findById(projectId);
        if (!project) {
            project = new Project({ name: prompt.substring(0, 25), userId, files: { html: "GENERATING" } });
            await project.save();
        }
        res.json({ projectId: project._id });

        (async () => {
            try {
                const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { role: "system", content: "Je bent KAVRIX PRO AI. Output ALTIJD JSON: {\"html\": \"...\", \"css\": \"...\", \"js\": \"...\"}. Gebruik Tailwind CSS en Unsplash voor foto's." },
                        { role: "user", content: prompt }
                    ],
                    response_format: { type: "json_object" }
                }, { headers: { 'Authorization': `Bearer ${API_KEY}` } });

                const aiRes = JSON.parse(response.data.choices[0].message.content);
                await Project.findByIdAndUpdate(project._id, { files: aiRes, updatedAt: new Date() });
            } catch (err) { console.error("AI Fout:", err.message); }
        })();
    } catch (e) { res.status(500).json({ error: "Fout" }); }
});

app.get('/projects/:userId', async (req, res) => {
    const projects = await Project.find({ userId: req.params.userId }).sort({ updatedAt: -1 });
    res.json(projects);
});

app.get('/project/:id', async (req, res) => {
    const project = await Project.findById(req.params.id);
    res.json(project);
});

app.delete('/project/:id', async (req, res) => {
    await Project.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

app.get('/', (req, res) => res.send('KAVRIX API Online'));
app.listen(process.env.PORT || 3000);
