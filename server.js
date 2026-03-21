// server.js - KAVRIX ELITE EDITION (DeepAgent Logic)
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

// Config & Env
const API_KEY = process.env.API_KEY || ''; 
const AI_API_URL = process.env.AI_API_URL || 'https://api.groq.com/openai/v1/chat/completions';
const AI_MODEL = process.env.AI_MODEL || 'llama-3.3-70b-versatile';
const JWT_SECRET = process.env.JWT_SECRET || 'kavrix_elite_secret_99';
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || '';

app.use(cors());
app.use(express.json({ limit: '15mb' }));

// MongoDB Connect
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI).then(() => console.log('Elite DB Connected')).catch(err => console.error('DB Error:', err));
}

// Schemas
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }
}));

const Project = mongoose.models.Project || mongoose.model('Project', new mongoose.Schema({
  name: String,
  userId: mongoose.Schema.Types.ObjectId,
  files: { html: String, css: String, js: String },
  assets: Array,
  updatedAt: { type: Date, default: Date.now }
}));

// --- ELITE ASSET LOGIC ---
function createEliteAssets(prompt) {
  const clean = (prompt || '').toLowerCase();
  const stopWords = ['maak', 'een', 'het', 'de', 'app', 'website', 'genereer'];
  const keywords = clean.replace(/[^\w\s]/gi, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.includes(w));
  const query = keywords.slice(0, 2).join(',') || 'modern,tech';

  return {
    primary: `https://loremflickr.com/1600/900/${encodeURIComponent(query)}?lock=${Math.floor(Math.random()*9999)}`,
    logo: `https://ui-avatars.com/api/?name=${encodeURIComponent(query[0] || 'K')}&background=random&color=fff&size=128&bold=true`,
    query
  };
}

// --- GENERATE ROUTE (DEEPAGENT STYLE) ---
app.post('/generate', async (req, res) => {
  const { prompt, projectId } = req.body;
  const authHeader = req.headers['authorization'];
  
  if (!prompt) return res.status(400).json({ error: 'Geen prompt ontvangen' });

  // 1. Maak of zoek project
  let project;
  try {
    if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
      project = await Project.findById(projectId);
    }
    if (!project) {
      project = new Project({ name: prompt.substring(0, 30), files: { html: 'GENERATING...' } });
      await project.save();
    }
  } catch (e) { project = { _id: 'temp-' + Date.now() }; }

  // Stuur direct ID terug voor polling
  res.json({ projectId: project._id });

  // 2. AI Generatie op de achtergrond
  (async () => {
    const assets = createEliteAssets(prompt);
    
    const systemPrompt = `Je bent KAVRIX ELITE AI (DeepAgent Architect). 
    Bouw een volledige, professionele web-app gebaseerd op de prompt van de gebruiker.
    
    TECHNISCHE EISEN:
    - Gebruik Tailwind CSS voor alle styling.
    - Gebruik Lucide Icons (via UNPKG of CDN) voor iconen.
    - Gebruik Framer Motion of Animate.css voor vloeiende transities.
    - De UI moet "App-like" zijn: Glassmorphism, afgeronde hoeken (2xl), subtiele schaduwen.
    - Gebruik de volgende assets: Logo: ${assets.logo}, Hero: ${assets.primary}.
    
    OUTPUT FORMAT:
    Je MOET antwoorden met een puur JSON object:
    {
      "html": "volledige body content inclusief scripts voor icons/animaties",
      "css": "extra custom css indien nodig",
      "js": "interactieve logica"
    }
    Toon GEEN tekst buiten de JSON.`;

    try {
      const response = await axios.post(AI_API_URL, {
        model: AI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Bouw deze app: ${prompt}` }
        ],
        temperature: 0.3
      }, {
        headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' }
      });

      let content = response.data.choices[0].message.content;
      // JSON Opschonen (verwijder markdown backticks indien aanwezig)
      content = content.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(content);

      // Voeg Tailwind & Lucide toe als ze ontbreken
      if (!parsed.html.includes('tailwindcss')) {
        parsed.html = `<script src="https://cdn.tailwindcss.com"></script>\n<script src="https://unpkg.com/lucide@latest"></script>\n` + parsed.html;
      }
      // Initialiseer Lucide icons
      parsed.js = `lucide.createIcons();\n` + (parsed.js || '');

      await Project.findByIdAndUpdate(project._id, {
        files: { html: parsed.html, css: parsed.css, js: parsed.js },
        updatedAt: new Date()
      });

    } catch (err) {
      console.error('Elite Gen Error:', err.message);
      await Project.findByIdAndUpdate(project._id, {
        files: { html: `<div class="p-10 bg-red-900 text-white">Fout bij genereren: ${err.message}</div>` }
      });
    }
  })();
});

// Overige routes (Login, Register, Project ophalen)
app.get('/project/:id', async (req, res) => {
  const p = await Project.findById(req.params.id);
  res.json(p || { error: 'Niet gevonden' });
});

app.get('/', (req, res) => res.send('KAVRIX ELITE API ONLINE'));

app.listen(PORT, () => console.log(`Elite Server op poort ${PORT}`));
