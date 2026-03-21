// server.js (FINAL VERSION - Optimized for Image Accuracy & Logo Fix)
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

let resend = null;
if (process.env.RESEND_API_KEY) {
  try { resend = new Resend(process.env.RESEND_API_KEY); } catch (e) { console.warn('Resend init failed:', e?.message || e); }
}

app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));

// CONFIG
const MONGODB_URI = process.env.MONGODB_URI || '';
const API_KEY = process.env.API_KEY || ''; 
const AI_API_URL = process.env.AI_API_URL || 'https://api.groq.com/openai/v1/chat/completions';
const AI_MODEL = process.env.AI_MODEL || 'llama-3.3-70b-versatile';
const JWT_SECRET = process.env.JWT_SECRET || 'kavrix_default_jwt_secret_change_me';
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN || null;
const PORT = process.env.PORT || 3000;

// MongoDB connect
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB verbonden'))
    .catch(err => console.error('MongoDB connect fout:', err?.message || err));
}

// Schemas
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  isVerified: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

const ProjectSchema = new mongoose.Schema({
  name: { type: String, default: 'Nieuw Project' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  files: {
    html: { type: String, default: '' },
    css: { type: String, default: '' },
    js: { type: String, default: '' }
  },
  assets: [{ name: String, url: String }],
  updatedAt: { type: Date, default: Date.now }
});
const Project = mongoose.models.Project || mongoose.model('Project', ProjectSchema);

// Uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-\.]/g, '');
    cb(null, `${Date.now()}-${uuidv4()}-${safe}`);
  }
});
const upload = multer({ storage });
app.use('/uploads', express.static(uploadsDir));

// Helpers
function extractToken(req) {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) return auth.split(' ')[1];
  return req.body?.token || req.query?.token || null;
}

function safeJSONParse(text) {
  if (!text || typeof text !== 'string') return null;
  try { return JSON.parse(text); } catch (_) {}
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch (_) {} }
  return null;
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe.replace(/[&<>"'`=\/]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;','`':'&#x60;','=':'&#x3D;'}[s]));
}

// --- IMAGE LOGIC: UNPLASH FOR ACCURACY ---
function createAssetsFromPrompt(prompt) {
  const cleaned = (prompt || '').toLowerCase();
  
  // Trefwoorden mapping voor betere foto's
  let query = "modern-design";
  if (cleaned.includes("biefstuk") || cleaned.includes("steak") || cleaned.includes("vlees")) query = "steak-dinner";
  if (cleaned.includes("pizza")) query = "pizza-oven";
  if (cleaned.includes("burger")) query = "gourmet-burger";
  if (cleaned.includes("auto") || cleaned.includes("car")) query = "luxury-car";
  if (cleaned.includes("kapper") || cleaned.includes("barber")) query = "barbershop";
  if (cleaned.includes("fitness") || cleaned.includes("gym")) query = "gym-workout";

  // Unsplash Source: Altijd een echte foto die past bij de query
  const dynamicPhoto = `https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1400&q=80`; // Default steak als backup
  const unsplashUrl = `https://source.unsplash.com/featured/1400x900?${query}&sig=${Math.floor(Math.random()*1000)}`;

  // Logo Fix: Gebruik UI-Avatars (geen vraagtekens meer)
  const firstWord = (cleaned.split(' ')[0] || 'K').toUpperCase().substring(0, 2);
  const logo = `https://ui-avatars.com/api/?name=${firstWord}&background=fb923c&color=fff&size=128&bold=true`;

  return { dynamicPhoto: unsplashUrl, logo };
}

// Auth Endpoints
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  const user = new User({ email: email.toLowerCase().trim(), password: hashed });
  await user.save();
  res.json({ message: 'OK' });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase().trim() }).exec();
  if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Fout' });
  const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, userId: user._id });
});

async function authMiddleware(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = await User.findById(decoded.userId).exec();
    next();
  } catch (e) { res.status(401).json({ error: 'Fout' }); }
}

// Generate Endpoint
app.post('/generate', authMiddleware, async (req, res) => {
  const { prompt, projectId } = req.body;
  const userId = req.user._id;

  // Maak project aan of haal op
  let project;
  if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
    project = await Project.findById(projectId).exec();
  }
  if (!project) {
    project = new Project({ name: prompt.substring(0, 30), userId, files: { html: 'GENERATING' } });
    await project.save();
  }

  res.json({ projectId: project._id });

  // AI Assets genereren
  const { dynamicPhoto, logo } = createAssetsFromPrompt(prompt);

  // AI Call
  (async () => {
    try {
      const systemMsg = `Expert Web Designer. Output JSON: {"html":"...","css":"...","js":"..."}. 
      GEBRUIK DEZE AFBEELDINGEN: Logo: ${logo}, Hero: ${dynamicPhoto}. 
      Gebruik Tailwind CSS. De tekst MOET exact zijn: "${prompt}".`;

      const aiRes = await axios.post(AI_API_URL, {
        model: AI_MODEL,
        messages: [{ role: 'system', content: systemMsg }, { role: 'user', content: prompt }],
        temperature: 0.2
      }, { headers: { 'Authorization': `Bearer ${API_KEY}` } });

      let text = aiRes.data.choices[0].message.content;
      let parsed = safeJSONParse(text) || { html: `<h1>${prompt}</h1><img src="${dynamicPhoto}">`, css: '', js: '' };

      // Forceer de juiste afbeeldingen in de HTML als de AI ze vergeet
      if (!parsed.html.includes(dynamicPhoto)) {
        parsed.html = `<div style="background-image:url('${dynamicPhoto}');background-size:cover;height:400px;"></div>` + parsed.html;
      }
      if (!parsed.html.includes(logo)) {
        parsed.html = `<nav><img src="${logo}" width="50"></nav>` + parsed.html;
      }

      await Project.findByIdAndUpdate(project._id, {
        files: { html: parsed.html, css: parsed.css, js: parsed.js },
        assets: [{ name: 'Hero', url: dynamicPhoto }, { name: 'Logo', url: logo }],
        updatedAt: new Date()
      });
    } catch (err) {
      console.error(err);
      await Project.findByIdAndUpdate(project._id, { 'files.html': 'Fout bij genereren.' });
    }
  })();
});

// Project Endpoints
app.get('/projects/:userId', async (req, res) => {
  const projects = await Project.find({ userId: req.params.userId }).sort({ updatedAt: -1 });
  res.json(projects);
});

app.get('/project/:id', async (req, res) => {
  const project = await Project.findById(req.params.id);
  res.json(project);
});

app.get('/', (req, res) => res.send('KAVRIX API ONLINE'));

app.listen(PORT, () => console.log(`Server op poort ${PORT}`));
