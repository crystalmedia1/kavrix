// server.js (complete - vervang je huidige file met deze)
// Noot: installeer dependencies indien nodig:
// npm install express cors axios mongoose bcryptjs jsonwebtoken resend multer path fs dotenv uuid archiver

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// CONFIGURATIE
const MONGODB_URI = process.env.MONGODB_URI;
const API_KEY = process.env.API_KEY; // Abacus / Groq / andere
const JWT_SECRET = process.env.JWT_SECRET || 'kavrix_master_key_2024';
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN || null; // zet dit in Render/Vercel op jouw URL

// DATABASE VERBINDING
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("KAVRIX Database Verbonden!"))
  .catch(err => console.error("Database Fout:", err));

// --- SCHEMAS ---
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  isVerified: { type: Boolean, default: true },
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
  assets: [{ name: String, url: String }], // toegevoegde assets array
  updatedAt: { type: Date, default: Date.now }
});
const Project = mongoose.model('Project', ProjectSchema);

// --- UPLOAD SETUP ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/\s+/g, '_');
    const unique = Date.now() + '-' + uuidv4() + '-' + safe;
    cb(null, unique);
  }
});
const upload = multer({ storage });

// Static serve uploads
app.use('/uploads', express.static(uploadDir));

// --- HELPERS ---
function extractToken(req) {
  // Authorization: Bearer <token>
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) return auth.split(' ')[1];
  if (req.body && req.body.token) return req.body.token;
  if (req.query && req.query.token) return req.query.token;
  return null;
}

async function sendAdminNotification(subject, html) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    await resend.emails.send({
      from: 'KAVRIX <onboarding@resend.dev>',
      to: 'zakelijk90@hotmail.com',
      subject,
      html
    });
  } catch (e) {
    console.warn('Resend send failed (non-fatal):', e?.message || e);
  }
}

function safeJSONParse(text) {
  if (!text || typeof text !== 'string') return null;
  // direct parse
  try { return JSON.parse(text); } catch (_) {}
  // try extract {...}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (_) {}
  }
  return null;
}

// --- AUTH ROUTES ---

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
      isVerified: true
    });
    await user.save();

    console.log('[REGISTER] Nieuwe gebruiker aangemaakt:', lowered);

    // Background notification (non-blocking)
    sendAdminNotification('Nieuwe KAVRIX Gebruiker', `<p>Gebruiker <b>${lowered}</b> heeft zich geregistreerd.</p>`).catch(() => {});

    res.json({ message: "Registratie voltooid! Je kunt nu direct inloggen." });
  } catch (e) {
    console.error("Registratie Fout:", e);
    res.status(500).json({ error: "Server fout bij registratie." });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(401).json({ error: "Gebruiker niet gevonden." });

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

// --- UPLOAD ENDPOINT ---
app.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const base = BACKEND_ORIGIN || `${req.protocol}://${req.get('host')}`;
    const url = `${base}/uploads/${req.file.filename}`;
    return res.json({ filename: req.file.originalname, storedName: req.file.filename, url });
  } catch (e) {
    console.error('Upload fout:', e);
    res.status(500).json({ error: 'Upload fout' });
  }
});

// --- AUTH MIDDLEWARE ---
async function authMiddleware(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: 'Token vereist' });
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Ongeldige token' });
    }
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(401).json({ error: 'Gebruiker niet gevonden' });
    req.user = user;
    next();
  } catch (e) {
    console.error('Auth middleware fout:', e);
    res.status(500).json({ error: 'Auth fout' });
  }
}

// --- PROJECT & AI ROUTES ---

// Create minimal project or return existing
async function ensureProject(userId, projectId, nameHint) {
  if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
    const p = await Project.findById(projectId);
    if (p) return p;
  }
  const p = new Project({
    name: (nameHint || 'Nieuw Project').substring(0, 60),
    userId,
    files: { html: "GENERATING", css: "", js: "" },
    assets: []
  });
  await p.save();
  return p;
}

// /generate: accepts body { prompt, userId, projectId, uploadedAssets (optional) }
// requires Authorization Bearer <token> OR token in body
app.post('/generate', authMiddleware, async (req, res) => {
  try {
    const { prompt, projectId, uploadedAssets } = req.body;
    const userId = req.user._id;

    const project = await ensureProject(userId, projectId, prompt);
    // Save placeholder status quickly
    await Project.findByIdAndUpdate(project._id, { 'files.html': 'GENERATING', updatedAt: new Date() });

    // respond immediately with projectId
    res.json({ projectId: project._id });

    // Build asset context
    const assets = Array.isArray(uploadedAssets) ? uploadedAssets : (project.assets || []);
    // assets is expected to be array of { name, url } or strings -> normalize
    const normAssets = assets.map(a => {
      if (typeof a === 'string') return { name: path.basename(a), url: a };
      if (a && a.url) return { name: a.name || path.basename(a.url), url: a.url };
      return null;
    }).filter(Boolean);

    // Save assets in project (so preview later can use)
    if (normAssets.length > 0) {
      await Project.findByIdAndUpdate(project._id, { assets: normAssets, updatedAt: new Date() });
    }

    // Compose AI prompt
    let assetText = '';
    if (normAssets.length) {
      assetText = '\nBeschikbare assets (gebruik deze exacte URL\'s in <img src=\"...\"):\n' +
        normAssets.map(a => `${a.name} -> ${a.url}`).join('\n') + '\n';
    }

    const systemMessage = `Je bent KAVRIX PRO AI. OUTPUT ALTIJD EEN JSON OBJECT ALS VOLGT:
{"html":"...","css":"...","js":"..."}.
Gebruik bij voorkeur Tailwind CSS (via <script src="https://cdn.tailwindcss.com"></script> in het head).
BELANGRIJK: Gebruik precise, absolute image URLs (zoals https://.../uploads/xxx.png). NIET: lokale bestandsnamen zoals "logo.png".`;

    const userMessage = `${prompt}\n\n${assetText}\nGenereer een volledige werkende single-page HTML (met inline <style> en <script> of met sections) en zet de HTML in "html", CSS in "css" en JS in "js" in het JSON-object.`;

    // Background AI call
    (async () => {
      try {
        const aiReqBody = {
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: userMessage }
          ],
          // response_format not always supported; keep normal and parse
          max_tokens: 2000,
          temperature: 0.2
        };

        const groqUrl = 'https://api.groq.com/openai/v1/chat/completions';
        const aiResp = await axios.post(groqUrl, aiReqBody, {
          headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
          timeout: 120000
        });

        // try to extract text content (depends on provider)
        let text = null;
        if (aiResp.data) {
          // common OpenAI-like shape: choices[0].message.content
          if (aiResp.data.choices && aiResp.data.choices[0] && aiResp.data.choices[0].message) {
            text = aiResp.data.choices[0].message.content;
          } else if (typeof aiResp.data === 'string') {
            text = aiResp.data;
          } else {
            // fallback: stringify
            text = JSON.stringify(aiResp.data);
          }
        }

        // robust parse
        let parsed = safeJSONParse(text);
        if (!parsed) {
          // attempt to ask the model again? For now, try to salvage by building a basic template using assets.
          console.warn('AI response could not be parsed as JSON. Storing fallback template.');
          const fallbackHtmlParts = [];
          if (normAssets.length) {
            const img = normAssets[0];
            fallbackHtmlParts.push(`<div style="padding:24px;text-align:center"><img src="${img.url}" style="max-width:90%;height:auto;border-radius:12px;margin-bottom:12px" alt="${img.name}"/></div>`);
          }
          fallbackHtmlParts.push(`<h1 style="text-align:center;color:#fff">Gegenereerde App</h1><p style="text-align:center;color:#9aa3b2">${prompt}</p>`);
          parsed = {
            html: fallbackHtmlParts.join('\n'),
            css: `body{background:#0b1220;color:#e6eef8;font-family:Inter,system-ui,sans-serif} .kavrix-center{text-align:center}`,
            js: ''
          };
        }

        // Ensure strings
        parsed.html = parsed.html || '';
        parsed.css = parsed.css || '';
        parsed.js = parsed.js || '';

        // Save to project
        await Project.findByIdAndUpdate(project._id, {
          files: {
            html: parsed.html,
            css: parsed.css,
            js: parsed.js
          },
          updatedAt: new Date()
        });

        // Optional: notify admin
        sendAdminNotification('AI Gen Voltooid', `<p>Project ${project._id} voor user ${userId} is afgerond.</p>`).catch(() => {});

      } catch (err) {
        console.error("AI Generatie Fout (achtergrond):", err?.message || err);
        // store error message in project files so frontend can show something
        await Project.findByIdAndUpdate(project._id, {
          files: {
            html: `<div style="padding:24px;color:#fff;background:#111827"><h3>AI Generatie Fout</h3><pre style="white-space:pre-wrap;color:#f87171">${(err?.message||'Onbekende fout')}</pre></div>`,
            css: '',
            js: ''
          },
          updatedAt: new Date()
        });
      }
    })();

  } catch (e) {
    console.error('Generate route fout:', e);
    res.status(500).json({ error: 'Generate fout' });
  }
});

// --- PROJECTS CRUD ---
app.get('/projects/:userId', async (req, res) => {
  try {
    const projects = await Project.find({ userId: req.params.userId }).sort({ updatedAt: -1 });
    res.json(projects);
  } catch (e) {
    console.error('projects ophalen fout:', e);
    res.json([]);
  }
});

app.get('/project/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project niet gevonden.' });
    res.json(project);
  } catch (e) {
    console.error('project ophalen fout:', e);
    res.status(404).json({ error: 'Project niet gevonden.' });
  }
});

app.delete('/project/:id', authMiddleware, async (req, res) => {
  try {
    const proj = await Project.findById(req.params.id);
    if (!proj) return res.status(404).json({ error: 'Project niet gevonden' });
    if (proj.userId.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Geen toegang' });
    await Project.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    console.error('delete project fout:', e);
    res.status(500).json({ error: 'Fout bij verwijderen.' });
  }
});

// -- Basic root test
app.get('/', (req, res) => res.send('KAVRIX PRO API is Online 🚀'));

// START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server draait op poort ${PORT}`));
