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
    isVerified: { type: Boolean, default: false },
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

// 1. Registreren (Aangepast voor jouw Resend-testfase)
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
            isVerified: false 
        });
        await user.save();

        // Verificatie Token & Link
        const vToken = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '1d' });
        const verifyUrl = `https://kavrix.onrender.com/verify-email?token=${vToken}`;

        // TIJDELIJK: Altijd naar jouw geverifieerde adres sturen
        const myVerifiedEmail = 'zakelijk90@hotmail.com';

        console.log('[REGISTER] Nieuwe user:', lowered, 'Mail gaat naar:', myVerifiedEmail);

        const { error } = await resend.emails.send({
            from: 'KAVRIX <onboarding@resend.dev>',
            to: myVerifiedEmail, 
            subject: 'Activeer KAVRIX Account voor: ' + lowered,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; padding: 40px; border-radius: 16px;">
                    <h1 style="color: #6366f1;">Nieuwe Registratie!</h1>
                    <p>Er is een account aangemaakt voor: <strong>${lowered}</strong></p>
                    <p>Klik op de knop hieronder om dit account te activeren:</p>
                    <a href="${verifyUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 20px;">Account Activeren</a>
                    <p style="margin-top: 30px; color: #64748b; font-size: 12px;">Link: ${verifyUrl}</p>
                </div>
            `
        });

        if (error) {
            console.error("Resend Error:", error);
            return res.status(500).json({ error: "Mail kon niet verzonden worden." });
        }

        res.json({ message: "Check je inbox (zakelijk90@hotmail.com) voor de activatielink!" });
    } catch (e) {
        console.error("Registratie Fout:", e);
        res.status(500).json({ error: "Server fout bij registratie." });
    }
});

// 2. Email Verifiëren
app.get('/verify-email', async (req, res) => {
    try {
        const { token } = req.query;
        const decoded = jwt.verify(token, JWT_SECRET);
        await User.findByIdAndUpdate(decoded.userId, { isVerified: true });
        res.send(`
            <div style="font-family:sans-serif; text-align:center; padding:50px;">
                <h1 style="color:#6366f1;">Account Geverifieerd!</h1>
                <p>Je kunt nu teruggaan naar de website en inloggen.</p>
                <a href="https://kavrix.github.io/" style="color:#6366f1; font-weight:bold;">Ga naar KAVRIX PRO</a>
            </div>
        `);
    } catch (e) {
        res.status(400).send("Link is ongeldig of verlopen.");
    }
});

// 3. Inloggen
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        
        if (!user) return res.status(401).json({ error: "Gebruiker niet gevonden." });
        if (!user.isVerified) return res.status(401).json({ error: "Bevestig eerst je emailadres via de link in je inbox!" });

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return res.status(401).json({ error: "Wachtwoord onjuist." });

        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, userId: user._id });
    } catch (e) {
        res.status(500).json({ error: "Server fout bij inloggen." });
    }
});

// --- APP FUNCTIONALITEIT ROUTES ---

// 4. App Genereren (AI)
app.post('/generate', async (req, res) => {
    const { prompt, userId, projectId, token } = req.body;
    try {
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

// 5. Projecten ophalen
app.get('/projects/:userId', async (req, res) => {
    try {
        const projects = await Project.find({ userId: req.params.userId }).sort({ updatedAt: -1 });
        res.json(projects);
    } catch (e) {
        res.json([]);
    }
});

// 6. Specifiek project ophalen
app.get('/project/:id', async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);
        res.json(project);
    } catch (e) {
        res.status(404).json({ error: "Project niet gevonden." });
    }
});

// 7. Project verwijderen
app.delete('/project/:id', async (req, res) => {
    try {
        await Project.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Fout bij verwijderen." });
    }
});

app.get('/', (req, res) => res.send('KAVRIX PRO API is Online 🚀'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server draait op poort ${PORT}`));
