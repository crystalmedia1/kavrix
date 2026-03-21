// server.js (kopieer/plak dit volledig)
// Dependencies:
// npm install express cors axios mongoose bcryptjs jsonwebtoken resend multer dotenv uuid

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

// Optional: initialize Resend if API key present
let resend = null;
if (process.env.RESEND_API_KEY) {
  try { resend = new Resend(process.env.RESEND_API_KEY); } catch (e) { console.warn('Resend init failed:', e?.message || e); }
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CONFIG
const MONGODB_URI = process.env.MONGODB_URI || '';
const API_KEY = process.env.API_KEY || '';
const AI_API_URL = process.env.AI_API_URL || 'https://api.groq.com/openai/v1/chat/completions'; // override if needed
const JWT_SECRET = process.env.JWT_SECRET || 'kavrix_default_jwt_secret_change_me';
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN || null;
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
if (!MONGODB_URI) {
  console.warn('MONGODB_URI not set. DB features will fail until provided.');
}
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB verbonden'))
  .catch(err => console.error('MongoDB connect fout:', err?.message || err));

// --- Schemas ---
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
  assets: [{ name: String, url: String }], // public asset URLs
  updatedAt: { type: Date, default: Date.now }
});
const Project = mongoose.model('Project', ProjectSchema);

// --- Upload setup ---
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-\.]/g, '');
    const unique = `${Date.now()}-${uuidv4()}-${safe}`;
    cb(null, unique);
  }
});
const upload = multer({ storage });

// Serve uploads publicly
app.use('/uploads', express.static(uploadsDir));

// --- Helpers ---
function extractToken(req) {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) return auth.split(' ')[1];
  if (req.body && req.body.token) return req.body.token;
  if (req.query && req.query.token) return req.query.token;
  return null;
}

async function sendAdminNotification(subject, html) {
  if (!resend) return;
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
  // Direct JSON parse
  try { return JSON.parse(text); } catch (_) {}
  // Try to extract first JSON object or array substring
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch (_) {}
  }
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch (_) {}
  }
  // No parseable JSON found
  return null;
}

// --- Auth Routes ---
app.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Vul alle velden in.' });
    const normalized = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalized });
    if (existing) return res.status(400).json({ error: 'Email bestaat al.' });
    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ email: normalized, password: hashed, isVerified: true });
    await user.save();
    sendAdminNotification('Nieuwe gebruiker geregistreerd', `<p>${normalized}</p>`).catch(()=>{});
    res.json({ message: 'Registratie gelukt. Je kunt nu inloggen.' });
  } catch (e) {
    console.error('register error:', e?.message || e);
    res.status(500).json({ error: 'Server fout bij registratie.' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(401).json({ error: 'Gebruiker niet gevonden.' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Wachtwoord onjuist.' });
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, userId: user._id });
  } catch (e) {
    console.error('login error:', e?.message || e);
    res.status(500).json({ error: 'Server fout bij inloggen.' });
  }
});

// --- Upload endpoint ---
app.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const base = BACKEND_ORIGIN || `${req.protocol}://${req.get('host')}`;
    const url = `${base}/uploads/${req.file.filename}`;
    res.json({ filename: req.file.originalname, storedName: req.file.filename, url });
  } catch (e) {
    console.error('upload error:', e?.message || e);
    res.status(500).json({ error: 'Upload fout' });
  }
});

// --- Auth middleware ---
async function authMiddleware(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: 'Token vereist' });
    let decoded;
    try { decoded = jwt.verify(token, JWT_SECRET); } catch (err) { return res.status(401).json({ error: 'Ongeldige token' }); }
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(401).json({ error: 'Gebruiker niet gevonden' });
    req.user = user;
    next();
  } catch (e) {
    console.error('authMiddleware error:', e?.message || e);
    res.status(500).json({ error: 'Auth fout' });
  }
}

// --- Helper to create or get project ---
async function ensureProject(userId, projectId, nameHint) {
  if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
    const p = await Project.findById(projectId);
    if (p) return p;
  }
  const p = new Project({
    name: (nameHint || 'Nieuw Project').substring(0, 60),
    userId,
    files: { html: 'GENERATING', css: '', js: '' },
    assets: []
  });
  await p.save();
  return p;
}

// --- Generate endpoint (main) ---
// Accepts: { prompt, projectId (optional), uploadedAssets (optional) }
// Requires auth (Bearer token)
app.post('/generate', authMiddleware, async (req, res) => {
  try {
    const { prompt, projectId, uploadedAssets } = req.body;
    const userId = req.user._id;
    if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'Prompt vereist' });

    // Ensure project exists and set placeholder
    const project = await ensureProject(userId, projectId, prompt);
    await Project.findByIdAndUpdate(project._id, { 'files.html': 'GENERATING', updatedAt: new Date() });

    // Immediate response with projectId so frontend can poll
    res.json({ projectId: project._id });

    // Normalize assets
    const normAssets = Array.isArray(uploadedAssets) ? uploadedAssets.map(a => {
      if (typeof a === 'string') return { name: path.basename(a), url: a };
      if (a && a.url) return { name: a.name || path.basename(a.url), url: a.url };
      return null;
    }).filter(Boolean) : [];

    // Merge with existing project assets (avoid duplicates)
    const mergedAssets = [...(project.assets || [])];
    normAssets.forEach(a => {
      if (!mergedAssets.find(x => x.url === a.url)) mergedAssets.push(a);
    });
    if (mergedAssets.length > 0) {
      await Project.findByIdAndUpdate(project._id, { assets: mergedAssets, updatedAt: new Date() });
    }

    // Build assetText for prompt
    const assetText = mergedAssets.length > 0
      ? '\nBeschikbare assets (gebruik deze exacte URL\'s voor afbeeldingen):\n' + mergedAssets.map(a => `${a.name} -> ${a.url}`).join('\n') + '\n'
      : '';

    // --- IMPROVED AI PROMPT (allows Unsplash fallback) ---
    const systemMessage = `Je bent KAVRIX PRO AI, een expert UI/UX & frontend developer.
OUTPUT ALTIJD EEN GELDIG JSON OBJECT: {"html":"...","css":"...","js":"..."} (strings).
BELANGRIJKE RICHTLIJNEN VOOR AFBEELDINGEN:
1) Als "Beschikbare assets" gegeven zijn, gebruik bij voorkeur die exacte absolute URL(s) voor belangrijke content (hero, logos, etc).
2) Als er GEEN geüploade assets zijn of als je meer foto's nodig hebt, gebruik mooie Unsplash/placeholder afbeeldingen (voorbeeld URL's):
   https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1200&q=80
   https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80
3) Gebruik NOOIT lokale bestandsnamen zoals "logo.png" zonder https://.
4) Gebruik Tailwind CSS (voeg <script src=\"https://cdn.tailwindcss.com\"></script> in head) en maak het modern, dark-mode with spacing, gradients en duidelijk contrast.
5) De HTML, CSS en JS moeten direct werkend zijn als de gebruiker het in een .html plakt. Geef geen aanvullende tekst buiten het JSON object.`;

    const userMessage = `Opdracht: ${prompt}
${assetText}
Genereer een volledige single-page interface. Plaats de HTML in "html", de CSS in "css" (of inline styles), en eventuele scripts in "js". Als je afbeeldingen gebruikt, gebruik absolute https:// URL's.`;

    // Background AI call (asynchronous)
    (async () => {
      try {
        // Build AI request body (OpenAI-like chat completion)
        const aiReq = {
          model: process.env.AI_MODEL || 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: userMessage }
          ],
          max_tokens: 2000,
          temperature: 0.2
        };

        // Choose URL and headers
        const url = AI_API_URL;
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        };

        const aiResponse = await axios.post(url, aiReq, { headers, timeout: 120000 });

        // Extract text depending on provider response shape
        let text = null;
        if (aiResponse.data) {
          // OpenAI-like: choices[0].message.content
          if (aiResponse.data.choices && aiResponse.data.choices[0] && aiResponse.data.choices[0].message) {
            text = aiResponse.data.choices[0].message.content;
          } else if (aiResponse.data.choices && aiResponse.data.choices[0] && aiResponse.data.choices[0].text) {
            text = aiResponse.data.choices[0].text;
          } else if (typeof aiResponse.data === 'string') {
            text = aiResponse.data;
          } else {
            text = JSON.stringify(aiResponse.data);
          }
        }

        // Try to parse JSON out of the text
        let parsed = safeJSONParse(text);

        // If parsing fails, attempt to salvage by asking the model to return only JSON (retry once),
        // but to keep things simple we will fallback to a templated page.
        if (!parsed) {
          console.warn('AI response not valid JSON. Attempting salvage fallback.');
          // Build fallback HTML using first available asset or Unsplash
          const fallbackImg = (mergedAssets[0] && mergedAssets[0].url) || 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1200&q=80';
          parsed = {
            html: `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#020617,#07102a);color:#fff;padding:40px;font-family:Inter,system-ui,sans-serif;"><div style="max-width:900px;text-align:center;"><img src="${fallbackImg}" alt="hero" style="max-width:100%;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.6);margin-bottom:20px"/><h1 style="font-size:32px;margin-bottom:8px">Gegenereerde App</h1><p style="color:#cbd5e1">${prompt}</p></div></div>`,
            css: '',
            js: ''
          };
        }

        // Ensure required keys exist
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

        // Notify admin optionally
        sendAdminNotification('AI Gen afgerond', `<p>Project ${project._id} gegenereerd voor gebruiker ${userId}.</p>`).catch(()=>{});

      } catch (err) {
        console.error('AI generation error:', err?.message || err);
        // Persist an error message into the project files so frontend can show it
        try {
          await Project.findByIdAndUpdate(project._id, {
            files: {
              html: `<div style="padding:24px;color:#fff;background:#111827"><h3>AI Generatie Fout</h3><pre style="white-space:pre-wrap;color:#f87171">${(err?.message||'Onbekende fout')}</pre></div>`,
              css: '',
              js: ''
            },
            updatedAt: new Date()
          });
        } catch (saveErr) {
          console.error('Failed to save error into project:', saveErr?.message || saveErr);
        }
      }
    })();

  } catch (e) {
    console.error('Generate route error:', e?.message || e);
    return res.status(500).json({ error: 'Generate route fout' });
  }
});

// --- Projects CRUD ---
app.get('/projects/:userId', async (req, res) => {
  try {
    const projects = await Project.find({ userId: req.params.userId }).sort({ updatedAt: -1 });
    res.json(projects);
  } catch (e) {
    console.error('projects fetch error:', e?.message || e);
    res.status(500).json([]);
  }
});

app.get('/project/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project niet gevonden.' });
    res.json(project);
  } catch (e) {
    console.error('project fetch error:', e?.message || e);
    res.status(500).json({ error: 'Project ophalen mislukt.' });
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
    console.error('delete project error:', e?.message || e);
    res.status(500).json({ error: 'Fout bij verwijderen.' });
  }
});

// Health
app.get('/', (req, res) => res.send('KAVRIX PRO API Online'));

// Start
app.listen(PORT, () => {
  console.log(`Server draait op poort ${PORT} - BACKEND_ORIGIN=${BACKEND_ORIGIN || 'not-set'}`);
});
