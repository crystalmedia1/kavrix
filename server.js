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

// DATABASE VERBINDING
mongoose.connect(MONGODB_URI)
    .then(() => console.log("KAVRIX Database Verbonden!"))
    .catch(err => console.error("Database Verbindingsfout:", err));

// GEBRUIKER SCHEMA
const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

// PROJECT SCHEMA
const ProjectSchema = new mongoose.Schema({
    name: { type: String, default: 'Nieuw Project' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    files: { 
        html: { type: String, default: '' }, 
        css: { type: String, default: '' }, 
        js: { type: String, default: '' } 
    },
    updatedAt: { type: Date, default: Date.now }
});
const Project = mongoose.model('Project', ProjectSchema);

// --- AUTH ROUTES ---

app.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: "Vul alle velden in" });
        
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) return res.status(400).json({ error: "Dit emailadres is al geregistreerd" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ email: email.toLowerCase(), password: hashedPassword });
        await user.save();
        
        console.log("Nieuwe gebruiker geregistreerd:", email);
        res.json({ userId: user._id });
    } catch (e) { 
        console.error("Registratie fout:", e);
        res.status(500).json({ error: "Fout bij opslaan in database" }); 
    }
});

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ error: "Email of wachtwoord onjuist" });
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
                }, { headers: { 'Authorization': `Bearer ${API_KEY}` }, timeout: 60000 });

                const aiRes = JSON.parse(response.data.choices[0].message.content);
                await Project.findByIdAndUpdate(project._id, { files: aiRes, updatedAt: new Date() });
            } catch (err) { console.error("AI Fout:", err.message); }
        })();
    } catch (e) { res.status(500).json({ error: "Fout bij genereren" }); }
});

app.get('/projects/:userId', async (req, res) => {
    try {
        const projects = await Project.find({ userId: req.params.userId }).sort({ updatedAt: -1 });
        res.json(projects);
    } catch (e) { res.json([]); }
});

app.get('/project/:id', async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);
        res.json(project);
    } catch (e) { res.status(404).json({ error: "Niet gevonden" }); }
});

app.delete('/project/:id', async (req, res) => {
    try {
        await Project.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Fout bij verwijderen" }); }
});

app.get('/', (req, res) => res.send('KAVRIX API Online'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server draait op poort ${PORT}`));
