const express = require('express');
const cors = require('cors');
const axios = require('axios');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
require('dotenv').config();

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// CONFIGURATIE
const MONGODB_URI = process.env.MONGODB_URI;
const API_KEY = process.env.API_KEY; 
const JWT_SECRET = process.env.JWT_SECRET || 'kavrix_master_key_2024';

// DATABASE VERBINDING
mongoose.connect(MONGODB_URI)
    .then(() => console.log("KAVRIX Database Verbonden!"))
    .catch(err => console.error("Database Fout:", err));

// --- SCHEMAS ---

const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    isVerified: { type: Boolean, default: true }, // TIJDELIJK: Iedereen direct geverifieerd
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

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

// --- AUTHENTICATIE ROUTES ---

// 1. Registreren (Directe toegang zonder mail-verplichting)
app.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: "Vul alle velden in." });

        const lowered = email.toLowerCase().trim();
        const existingUser = await User.findOne({ email: lowered });
        if (existingUser) return res.status(400).json({ error: "Dit emailadres is al geregistreerd." });

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ 
            email: lowered, 
            password: hashedPassword,
            isVerified: true // DIRECT ACTIEF
        });
        await user.save();

        console.log('[REGISTER] Nieuwe gebruiker aangemaakt en direct geactiveerd:', lowered);

        // We proberen nog wel een notificatie naar jou te sturen, maar het blokkeert de user niet
        try {
            await resend.emails.send({
                from: 'KAVRIX <onboarding@resend.dev>',
                to: 'zakelijk90@hotmail.com', 
                subject: 'Nieuwe KAVRIX Gebruiker: ' + lowered,
                html: `<p>Gebruiker <b>${lowered}</b> heeft zich geregistreerd en kan direct inloggen.</p>`
            });
        } catch (mErr) { 
            console.log("Notificatie mail kon niet verzonden worden, geen probleem."); 
        }

        res.json({ message: "Registratie voltooid! Je kunt nu direct inloggen." });
    } catch (e) {
        console.error("Registratie Fout:", e);
        res.status(500).json({ error: "Server fout bij registratie." });
    }
});

// 2. Inloggen
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        
        if (!user) return res.status(401).json({ error: "Gebruiker niet gevonden." });
        
        // Forceer verificatie op true voor bestaande accounts die vastzaten
        if (!user.isVerified) {
            user.isVerified = true;
            await user.save();
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return res.status(401).json({ error: "Wachtwoord onjuist." });

        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, userId: user._id });
    } catch (e) {
        console.error("Login Fout:", e);
        res.status(500).json({ error: "Server fout bij inloggen." });
    }
});

// --- APP FUNCTIONALITEIT ROUTES ---

// 3. App Genereren (AI)
app.post('/generate', async (req, res) => {
    const { prompt, userId, projectId, token } = req.body;
    try {
        // Beveiliging: Check token
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.userId !== userId) return res.status(401).json({ error: "Niet geautoriseerd." });

        let project;
        if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
            project = await Project.findById(projectId);
        }

        if (!project) {
            project = new Project({ 
                name: prompt.substring(0, 25), 
                userId, 
                files: { html: "GENERATING" } 
            });
            await project.save();
        }

        res.json({ projectId: project._id });

        // AI Generatie op de achtergrond
        (async () => {
            try {
                const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { role: "system", content: "Je bent KAVRIX PRO AI. Output ALTIJD JSON: {\"html\": \"...\", \"css\": \"...\", \"js\": \"...\"}. Gebruik Tailwind CSS." },
                        { role: "user", content: prompt }
                    ],
                    response_format: { type: "json_object" }
                }, { 
                    headers: { 'Authorization': `Bearer ${API_KEY}` },
                    timeout: 60000 
                });

                const aiContent = JSON.parse(response.data.choices[0].message.content);
                await Project.findByIdAndUpdate(project._id, { 
                    files: aiContent, 
                    updatedAt: new Date() 
                });
            } catch (err) {
                console.error("AI Generatie Fout:", err.message);
            }
        })();

    } catch (e) {
        res.status(401).json({ error: "Sessie verlopen. Log opnieuw in." });
    }
});

// 4. Projecten ophalen
app.get('/projects/:userId', async (req, res) => {
    try {
        const projects = await Project.find({ userId: req.params.userId }).sort({ updatedAt: -1 });
        res.json(projects);
    } catch (e) {
        res.json([]);
    }
});

// 5. Specifiek project ophalen
app.get('/project/:id', async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);
        res.json(project);
    } catch (e) {
        res.status(404).json({ error: "Project niet gevonden." });
    }
});

// 6. Project verwijderen
app.delete('/project/:id', async (req, res) => {
    try {
        await Project.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Fout bij verwijderen." });
    }
});

// 7. Test Route
app.get('/', (req, res) => res.send('KAVRIX PRO API is Online 🚀'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server draait op poort ${PORT}`));
