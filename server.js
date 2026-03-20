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

const MONGODB_URI = process.env.MONGODB_URI;
const API_KEY = process.env.API_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'kavrix_master_key_2024';

mongoose.connect(MONGODB_URI).then(() => console.log("KAVRIX DB LIVE"));

// GEBRUIKER SCHEMA
const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

// PROJECT SCHEMA
const ProjectSchema = new mongoose.Schema({
    name: { type: String, default: 'Nieuw Project' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    files: { html: String, css: String, js: String },
    updatedAt: { type: Date, default: Date.now }
});
const Project = mongoose.model('Project', ProjectSchema);

// --- AUTH ROUTES ---

app.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ error: "Email bestaat al" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ email, password: hashedPassword });
        await user.save();

        // VERIFICATIE MAIL VIA RESEND
        const vToken = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '1d' });
        const verifyUrl = `https://kavrix.onrender.com/verify-email?token=${vToken}`;

        await resend.emails.send({
            from: 'KAVRIX <onboarding@resend.dev>', // Gebruik dit voor de testfase
            to: email,
            subject: 'Bevestig je KAVRIX PRO account',
            html: `<h1>Welkom bij KAVRIX!</h1><p>Klik hier om je account te activeren:</p><a href="${verifyUrl}" style="background:#6366f1; color:white; padding:12px 24px; text-decoration:none; border-radius:8px; font-weight:bold;">Account Activeren</a>`
        });

        res.json({ message: "Check je mail voor de activatielink!" });
    } catch (e) { res.status(500).json({ error: "Fout bij registratie" }); }
});

app.get('/verify-email', async (req, res) => {
    try {
        const { token } = req.query;
        const decoded = jwt.verify(token, JWT_SECRET);
        await User.findByIdAndUpdate(decoded.userId, { isVerified: true });
        res.send("<h1>Account geverifieerd! Je kunt nu terug naar de site en inloggen.</h1>");
    } catch (e) { res.status(400).send("Link ongeldig of verlopen."); }
});

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ error: "Gebruiker niet gevonden" });
        if (!user.isVerified) return res.status(401).json({ error: "Bevestig eerst je email!" });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: "Wachtwoord onjuist" });

        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, userId: user._id });
    } catch (e) { res.status(500).json({ error: "Server fout" }); }
});

// --- APP ROUTES (Beveiligd) ---

app.post('/generate', async (req, res) => {
    const { prompt, userId, projectId, token } = req.body;
    try {
        jwt.verify(token, JWT_SECRET); // Check of de gebruiker echt ingelogd is
        let project;
        if (projectId) project = await Project.findById(projectId);
        if (!project) {
            project = new Project({ name: prompt.substring(0, 20), userId, files: { html: "GENERATING" } });
            await project.save();
        }
        res.json({ projectId: project._id });

        (async () => {
            const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: "Je bent KAVRIX AI. Output ALTIJD JSON: {\"html\": \"...\", \"css\": \"...\", \"js\": \"...\"}." },
                    { role: "user", content: prompt }
                ],
                response_format: { type: "json_object" }
            }, { headers: { 'Authorization': `Bearer ${API_KEY}` } });

            await Project.findByIdAndUpdate(project._id, { files: JSON.parse(response.data.choices[0].message.content) });
        })();
    } catch (e) { res.status(401).json({ error: "Sessie verlopen" }); }
});

app.get('/projects/:userId', async (req, res) => {
    const projects = await Project.find({ userId: req.params.userId }).sort({ updatedAt: -1 });
    res.json(projects);
});

app.get('/project/:id', async (req, res) => {
    const project = await Project.findById(req.params.id);
    res.json(project);
});

app.listen(process.env.PORT || 3000);
