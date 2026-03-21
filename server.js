// server.js (opschoning & update)
// Functies: auth, uploads, projecten, Groq AI-calls, No-Fail foto-injectie, Resend notificaties, debug-logging
// ENV VARS: API_KEY, BACKEND_ORIGIN, PROXY_IMAGES (true/false), MONGODB_URI, RESEND_API_KEY, JWT_SECRET, ADMIN_EMAIL

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

// optional resend init
let resend = null;
if (process.env.RESEND_API_KEY) {
  try { resend = new Resend(process.env.RESEND_API_KEY); } catch (e) { console.warn('Resend init failed:', e?.message || e); }
}

app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));

// CONFIG
const MONGODB_URI = process.env.MONGODB_URI || '';
const API_KEY = process.env.API_KEY || ''; // Groq / AI key
const AI_API_URL = process.env.AI_API_URL || 'https://api.groq.com/openai/v1/chat/completions';
const AI_MODEL = process.env.AI_MODEL || 'llama-3.3-70b-versatile';
const JWT_SECRET = process.env.JWT_SECRET || 'kavrix_default_jwt_secret_change_me';
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN || null;
const PORT = process.env.PORT || 3000;
// PROXY_IMAGES default false; zet op 'true' in env als je images via /proxy wilt laten lopen
const PROXY_IMAGES = (process.env.PROXY_IMAGES || 'false').toLowerCase() === 'true';

if (!API_KEY) console.warn('API_KEY niet ingesteld - AI-calls zullen falen (verwacht).');
if (!JWT_SECRET) console.warn('JWT_SECRET niet ingesteld - gebruik een veilige waarde in productie.');

// MongoDB (optioneel)
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB verbonden'))
    .catch(err => console.error('MongoDB connect fout:', err?.message || err));
} else {
  console.warn('MONGO URI niet gevonden: database functionaliteit beperkt.');
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
  updatedAt: { type: Date, default: Date.now },
  verbatim_prompt: { type: String, default: '' } // audit only
});
const Project = mongoose.models.Project || mongoose.model('Project', ProjectSchema);

// Uploads setup
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
app.use('/uploads', express.static(uploadsDir));

// Helpers
function extractToken(req) {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) return auth.split(' ')[1];
  if (req.body && req.body.token) return req.body.token;
  if (req.query && req.query.token) return req.query.token;
  return null;
}

function safeJSONParse(text) {
  if (!text || typeof text !== 'string') return null;
  try { return JSON.parse(text); } catch (_) {}
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch (_) {}
  }
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch (_) {}
  }
  return null;
}

async function sendAdminNotification(subject, html) {
  if (!resend) return;
  try {
    await resend.emails.send({
      from: `KAVRIX <${process.env.ADMIN_EMAIL || 'onboarding@resend.dev'}>`,
      to: process.env.ADMIN_EMAIL || 'zakelijk90@hotmail.com',
      subject,
      html
    });
  } catch (e) {
    console.warn('Resend send failed (non-fatal):', e?.message || e);
  }
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe.replace(/[&<>"'`=\/]/g, function (s) {
    return ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;',
      '`': '&#x60;',
      '=': '&#x3D;'
    })[s];
  });
}

// --------------------
// VERBETERDE IMAGE LOGIC (Dynamisch voor alle onderwerpen)
// --------------------

function buildProxyUrl(originalUrl) {
  if (!PROXY_IMAGES) return originalUrl;
  if (!BACKEND_ORIGIN) {
    console.warn('PROXY_IMAGES true maar BACKEND_ORIGIN niet ingesteld - proxy disabled.');
    return originalUrl;
  }
  return `${BACKEND_ORIGIN.replace(/\/$/, '')}/proxy?url=${encodeURIComponent(originalUrl)}`;
}

function createAssetsFromPrompt(prompt) {
  const cleaned = (prompt || '').toLowerCase();
  
  // Verwijder basale stopwoorden om het belangrijkste onderwerp te vinden
  const stopWords = ['maak', 'een', 'het', 'de', 'wil', 'ik', 'met', 'voor', 'van', 'app', 'website', 'genereer', 'toon', 'toont', 'laat', 'zien'];
  const words = cleaned.replace(/[^\w\s]/gi, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.includes(w));

  // Gebruik de eerste 2 relevante woorden als zoekterm (bijv. "rode ferrari")
  let mainQuery = words.slice(0, 2).join(',') || 'abstract';

  // Primary (loremflickr) - gebruikt nu de specifieke zoekterm
  const primary = `https://loremflickr.com/1400/900/${encodeURIComponent(mainQuery)}?lock=${Math.floor(Math.random()*100000)}`;
  
  // Fallbacks
  const picsum = `https://picsum.photos/seed/${encodeURIComponent(mainQuery)}/1400/900`;
  const unsplash = `https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1400&q=80`;

  // Logo via ui-avatars (pakt de eerste letter van je onderwerp)
  const firstLetter = (mainQuery[0] || 'K').toUpperCase();
  const logo = `https://ui-avatars.com/api/?name=${firstLetter}&background=random&color=fff&size=128&bold=true`;

  return {
    primary,
    fallbacks: [picsum, unsplash],
    logo,
    seedForDynamic: mainQuery
  };
}

// Proxy endpoint (optioneel)
app.get('/proxy', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') return res.status(400).send('Missing url');
    const decoded = decodeURIComponent(url);
    if (!/^https?:\/\//i.test(decoded)) return res.status(400).send('Invalid url');
    if (/localhost|127\.0\.0\.1|::1/.test(decoded)) return res.status(400).send('Forbidden url');

    const r = await axios.get(decoded, { responseType: 'stream', timeout: 20000 });
    const contentType = r.headers['content-type'] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=300');
    r.data.pipe(res);
  } catch (e) {
    console.error('Proxy error:', e?.message || e);
    res.status(500).send('Proxy failed');
  }
});

// --------------------
// Auth endpoints
// --------------------
app.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Vul alle velden in.' });
    const normalized = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalized }).exec().catch(()=>null);
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
    const user = await User.findOne({ email: email.toLowerCase().trim() }).exec();
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

async function authMiddleware(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: 'Token vereist' });
    let decoded;
    try { decoded = jwt.verify(token, JWT_SECRET); } catch (err) { return res.status(401).json({ error: 'Ongeldige token' }); }
    const user = await User.findById(decoded.userId).exec();
    if (!user) return res.status(401).json({ error: 'Gebruiker niet gevonden' });
    req.user = user;
    next();
  } catch (e) {
    console.error('authMiddleware error:', e?.message || e);
    res.status(500).json({ error: 'Auth fout' });
  }
}

// Upload endpoint
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

// Ensure project helper
async function ensureProject(userId, projectId, nameHint) {
  if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
    const p = await Project.findById(projectId).exec();
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

// Utility: ensure Tailwind is injected
function ensureTailwind(parsed) {
  try {
    if (!parsed.html) return parsed;
    const hasTailwind = /cdn\.tailwindcss\.com|tailwindcss/i.test(parsed.html);
    if (!hasTailwind) {
      parsed.html = `<script src="https://cdn.tailwindcss.com"></script>\n` + parsed.html;
    }
  } catch (e) {
    console.warn('Tailwind injection failed:', e?.message || e);
  }
  return parsed;
}

// Enforcement & injection helper (met robuuste hero detectie)
// NOTE: we DO NOT inject the user's prompt as visible HTML anymore.
// We still store verbatim_prompt in the project object for auditing, and we still
// inject a hero image/logo if the AI output lacks them.
function ensureComplianceAndInject(parsed, prompt, chosenBackground, mergedAssets) {
  parsed.html = parsed.html || '';
  parsed.css = parsed.css || '';
  parsed.js = parsed.js || '';
  parsed.verbatim_prompt = parsed.verbatim_prompt || '';

  try {
    const cleanedPrompt = (prompt || '').trim();
    // Instead of inserting a visible promptNotice into the HTML (which caused the issue),
    // we only set parsed.verbatim_prompt so it is stored with the project (audit trail).
    parsed.verbatim_prompt = cleanedPrompt;
  } catch (e) {
    console.warn('Verbatim prompt store failed:', e?.message || e);
  }

  // Hero detection: controleer of parsed.html al een grote <img> of background-image bevat
  function hasHeroImage(html, candidates) {
    if (!html) return false;
    // check for img tags pointing to candidate urls
    const lower = html.toLowerCase();
    for (const c of candidates) {
      if (!c) continue;
      if (lower.includes(c.toLowerCase())) return true;
    }
    // heuristics: presence of 'hero'/'background' classes/ids or large background-image usages
    if (/(class=["'][^"']*(hero|background|jumbo|hero-image)[^"']*["'])/.test(html)) return true;
    if (/background-image\s*:\s*url\(/i.test(html)) return true;
    if (/<img[^>]+class=["'][^"']*(w-full|h-full|object-cover|hero)[^"']*["']/i.test(html)) return true;
    return false;
  }

  try {
    if (chosenBackground) {
      const candidates = [chosenBackground].concat((mergedAssets || []).map(a => a.url).filter(Boolean));
      const containsBg = hasHeroImage(parsed.html, candidates);
      if (!containsBg) {
        // inject hero with the first reachable background from candidates
        const bg = buildProxyUrl(chosenBackground);
        const hero = `
          <div style="width:100%;height:60vh;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;">
            <img src="${bg}" alt="Hero" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"/>
            <div style="position:absolute;inset:0;background:linear-gradient(180deg, rgba(0,0,0,0.45), rgba(0,0,0,0.45));"></div>
            <div style="position:relative;z-index:3;padding:28px;color:#fff;max-width:1100px;text-align:center;">
              <h1 style="font-size:clamp(28px,6vw,64px);margin:0 0 12px;font-weight:700;">${escapeHtml((prompt || '').split('\n')[0] || '')}</h1>
              <p style="opacity:0.95;margin:0 0 18px;">${escapeHtml((prompt || '').slice(0,120) || '')}</p>
            </div>
          </div>
        `;
        if (/<body[^>]*>/i.test(parsed.html)) {
          parsed.html = parsed.html.replace(/<body[^>]*>/i, match => `${match}\n${hero}\n`);
        } else {
          parsed.html = hero + '\n' + parsed.html;
        }
      }
      if (!mergedAssets.find(a => a.url === chosenBackground)) {
        mergedAssets.push({ name: 'background', url: chosenBackground });
      }
    }
  } catch (e) {
    console.warn('Background injection failed:', e?.message || e);
  }

  // Proxy replacement if needed
  try {
    if (PROXY_IMAGES) {
      parsed.html = parsed.html.replace(/(<img[^>]+src=['"])(https?:\/\/[^'"]+)(['"][^>]*>)/gi, (m, p1, url, p3) => {
        const prox = buildProxyUrl(url);
        return `${p1}${prox}${p3}`;
      });
      parsed.html = parsed.html.replace(/url\((https?:\/\/[^)]+)\)/gi, (m, url) => {
        const clean = url.replace(/^["']|["']$/g, '');
        const prox = buildProxyUrl(clean);
        return `url(${prox})`;
      });
    }
  } catch (e) {
    console.warn('Image proxy replacement failed:', e?.message || e);
  }

  parsed = ensureTailwind(parsed);
  return { parsed, mergedAssets };
}

// GENERATE endpoint
app.post('/generate', authMiddleware, async (req, res) => {
  try {
    const { prompt, projectId, uploadedAssets } = req.body;
    const userId = req.user._id;
    if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'Prompt vereist' });

    const project = await ensureProject(userId, projectId, prompt);
    await Project.findByIdAndUpdate(project._id, { 'files.html': 'GENERATING', updatedAt: new Date() }).exec();

    // immediate response with projectId so frontend can poll
    res.json({ projectId: project._id });

    // normalize uploaded assets
    const normAssets = Array.isArray(uploadedAssets) ? uploadedAssets.map(a => {
      if (typeof a === 'string') return { name: path.basename(a), url: a };
      if (a && a.url) return { name: a.name || path.basename(a.url), url: a.url };
      return null;
    }).filter(Boolean) : [];

    const mergedAssets = [...(project.assets || [])];
    normAssets.forEach(a => { if (!mergedAssets.find(x => x.url === a.url)) mergedAssets.push(a); });
    if (mergedAssets.length > 0) {
      await Project.findByIdAndUpdate(project._id, { assets: mergedAssets, updatedAt: new Date() }).exec();
    }

    const assetText = mergedAssets.length > 0
      ? '\nBeschikbare assets (gebruik bij voorkeur deze absolute URL\'s voor afbeeldingen):\n' + mergedAssets.map(a => `${a.name} -> ${a.url}`).join('\n') + '\n'
      : '';

    // generate assets (improved)
    const { primary, fallbacks, logo } = createAssetsFromPrompt(prompt);

    // decide chosenBackground (try existing project asset first)
    let chosenBackground = null;
    const existingBg = mergedAssets.find(a => (a.name || '').toLowerCase().includes('background') || (a.name || '').toLowerCase().includes('hero'));
    if (existingBg && existingBg.url) {
      chosenBackground = existingBg.url;
    } else {
      chosenBackground = primary;
      if (!mergedAssets.find(a => a.url === primary)) mergedAssets.push({ name: 'background', url: primary });
    }

    // Revised system message: do NOT render the user's prompt or assets as visible UI text.
    const systemMessage = `Je bent KAVRIX PRO AI, een expert frontend developer en designer.
OUTPUT ALTIJD EEN GELDIG JSON OBJECT: {"html":"...","css":"...","js":"...","verbatim_prompt":"..."}.

BELANGRIJK (asset verplichtingen):
- Gebruik DE VOLGENDE ASSETS in de gegenereerde code:
  - Logo URL: ${logo}
  - Hoofdfoto URL (moet gebruikt worden): ${chosenBackground}
- WAARSCHUWING: NOOIT de oorspronkelijke prompt, NOOIT de opgelijste asset-URL's en NOOIT enige instructietekst letterlijk tonen als zichtbare tekst in de UI.
  - Zet de originele prompt uitsluitend in het JSON-veld "verbatim_prompt" (voor audit/history).
- Gebruik Tailwind CSS (via <script src="https://cdn.tailwindcss.com"></script> in de head).
- Geef GEEN extra tekst buiten het JSON-object.`;

    const userMessage = `Opdracht: ${prompt}

${assetText}
Genereer een single-page app met HTML, CSS en JS in JSON-formaat. Zorg dat de UI geen zichtbare kopieën van de opdracht of asset-lijst toont. Gebruik de opgegeven assets (logo en foto).`;

    if (!API_KEY) {
      const errHtml = `<div style="padding:24px;color:#fff;background:#111827"><h3>AI Key ontbreekt</h3><p>De AI API sleutel (API_KEY) is niet ingesteld op de server. Voeg je sleutel toe en probeer opnieuw.</p></div>`;
      await Project.findByIdAndUpdate(project._id, {
        files: { html: errHtml, css: '', js: '' },
        updatedAt: new Date()
      }).exec();
      return;
    }

    // background AI call (async)
    (async () => {
      try {
        const aiReq = {
          model: process.env.AI_MODEL || AI_MODEL,
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: userMessage }
          ],
          max_tokens: 2000,
          temperature: 0.2
        };

        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        };

        let aiResponse;
        try {
          aiResponse = await axios.post(AI_API_URL, aiReq, { headers, timeout: 120000 });
        } catch (callErr) {
          const status = callErr.response?.status;
          const data = callErr.response?.data;
          console.error('AI call failed:', status, data || callErr.message);

          const errorHtml = `<div style="padding:24px;color:#fff;background:#111827"><h3>AI Generatie Fout (API call)</h3><pre style="white-space:pre-wrap;color:#f87171">Status: ${status || 'unknown'}\n${escapeHtml(JSON.stringify(data || callErr.message, null, 2))}</pre></div>`;
          await Project.findByIdAndUpdate(project._id, {
            files: { html: errorHtml, css: '', js: '' },
            assets: [{ name: 'Main Photo', url: chosenBackground }, { name: 'Logo', url: logo }],
            updatedAt: new Date()
          }).exec();
          return;
        }

        // extract text from AI response
        let text = null;
        if (aiResponse.data) {
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

        let parsed = safeJSONParse(text);

        if (!parsed) {
          console.warn('AI response not valid JSON. Using fallback.');
          const fallbackImg = primary || (fallbacks && fallbacks[0]) || '';
          parsed = {
            html: `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#111827;color:#fff;padding:40px;font-family:Inter,system-ui,sans-serif;"><div style="max-width:900px;text-align:center;">${fallbackImg ? `<img src="${buildProxyUrl(fallbackImg)}" alt="hero" style="max-width:100%;border-radius:12px;margin-bottom:20px"/>` : ''}<h1 style="font-size:32px;margin-bottom:8px">Gegenereerde App</h1><p>${escapeHtml(prompt)}</p></div></div>`,
            css: '',
            js: '',
            verbatim_prompt: prompt
          };
        }

        // ensure keys
        parsed.html = parsed.html || '';
        parsed.css = parsed.css || '';
        parsed.js = parsed.js || '';
        parsed.verbatim_prompt = parsed.verbatim_prompt || '';

        // NO-FAIL injectie: forceer achtergrond en logo als AI ze vergeet
        try {
          const candidates = [chosenBackground].concat((mergedAssets || []).map(a => a.url).filter(Boolean));
          const hasChosenBg = (() => {
            const lower = (parsed.html || '').toLowerCase();
            for (const c of candidates) {
              if (!c) continue;
              if (lower.includes(c.toLowerCase())) return true;
            }
            if (/(class=["'][^"']*(hero|background|jumbo|hero-image)[^"']*["'])/.test(parsed.html)) return true;
            if (/<img[^>]+src=["']https?:\/\/[^"']+["'][^>]*>/i.test(parsed.html)) return true;
            if (/background-image\s*:\s*url\(/i.test(parsed.html)) return true;
            return false;
          })();

          if (!hasChosenBg) {
            const bgToUse = buildProxyUrl(chosenBackground) || (fallbacks && buildProxyUrl(fallbacks[0])) || '';
            if (bgToUse) {
              if (/<body[^>]*>/i.test(parsed.html)) {
                parsed.html = parsed.html.replace(/<body[^>]*>/i, match => `${match}\n<div class="w-full h-96 overflow-hidden"><img src="${bgToUse}" alt="Hero" class="w-full h-full object-cover" style="object-fit:cover;"/></div>\n`);
              } else {
                parsed.html = `<div class="w-full h-96 overflow-hidden"><img src="${bgToUse}" alt="Hero" class="w-full h-full object-cover" style="object-fit:cover;"/></div>\n` + parsed.html;
              }
            }
          }

          // Ensure logo appears; if not present, inject a small header with the logo
          const hasLogo = parsed.html.includes(logo) || /<svg[^>]+class=["'][^"']*logo[^"']*["']/.test(parsed.html);
          if (!hasLogo) {
            const logoHeader = `<header style="display:flex;align-items:center;gap:12px;padding:16px 20px;"><img src="${logo}" alt="Logo" style="width:48px;height:48px;border-radius:8px;object-fit:cover;"/><div style="font-weight:700">${escapeHtml((prompt || '').split(' ')[0] || 'Kavrix')}</div></header>`;
            if (/<body[^>]*>/i.test(parsed.html)) {
              parsed.html = parsed.html.replace(/<body[^>]*>/i, match => `${match}\n${logoHeader}\n`);
            } else {
              parsed.html = logoHeader + parsed.html;
            }
          }
        } catch (injectErr) {
          console.warn('Injectie fout:', injectErr?.message || injectErr);
        }

        // enforcement (store verbatim prompt, background presence, proxy urls, tailwind)
        try {
          const enforcement = ensureComplianceAndInject(parsed, prompt, chosenBackground, mergedAssets);
          parsed = enforcement.parsed;
        } catch (e) {
          console.warn('Enforcement step failed:', e?.message || e);
        }

        // save project (include verbatim_prompt field for auditing, but do NOT display it)
        await Project.findByIdAndUpdate(project._id, {
          files: {
            html: parsed.html,
            css: parsed.css,
            js: parsed.js
          },
          assets: mergedAssets.map(a => ({ name: a.name, url: a.url })),
          verbatim_prompt: (parsed.verbatim_prompt || prompt || '').toString().slice(0, 5000),
          updatedAt: new Date()
        }).exec();

        sendAdminNotification('AI Gen afgerond', `<p>Project ${project._id} gegenereerd voor gebruiker ${userId}.</p>`).catch(()=>{});

      } catch (err) {
        console.error('AI generation error:', err?.message || err);
        try {
          await Project.findByIdAndUpdate(project._id, {
            files: {
              html: `<div style="padding:24px;color:#fff;background:#111827"><h3>AI Generatie Fout</h3><pre style="white-space:pre-wrap;color:#f87171">${escapeHtml(err?.message || 'Onbekende fout')}</pre></div>`,
              css: '',
              js: ''
            },
            updatedAt: new Date()
          }).exec();
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

// Projects endpoints
app.get('/projects/:userId', async (req, res) => {
  try {
    const projects = await Project.find({ userId: req.params.userId }).sort({ updatedAt: -1 }).exec();
    res.json(projects);
  } catch (e) {
    console.error('projects fetch error:', e?.message || e);
    res.status(500).json([]);
  }
});

app.get('/project/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).exec();
    if (!project) return res.status(404).json({ error: 'Project niet gevonden.' });
    res.json(project);
  } catch (e) {
    console.error('project fetch error:', e?.message || e);
    res.status(500).json({ error: 'Project ophalen mislukt.' });
  }
});

app.delete('/project/:id', authMiddleware, async (req, res) => {
  try {
    const proj = await Project.findById(req.params.id).exec();
    if (!proj) return res.status(404).json({ error: 'Project niet gevonden' });
    if (proj.userId.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Geen toegang' });
    await Project.findByIdAndDelete(req.params.id).exec();
    res.json({ success: true });
  } catch (e) {
    console.error('delete project error:', e?.message || e);
    res.status(500).json({ error: 'Fout bij verwijderen.' });
  }
});

app.get('/', (req, res) => res.send('KAVRIX PRO API Online'));

app.listen(PORT, () => {
  console.log(`Server draait op poort ${PORT} - BACKEND_ORIGIN=${BACKEND_ORIGIN || 'not-set'} - PROXY_IMAGES=${PROXY_IMAGES}`);
});
