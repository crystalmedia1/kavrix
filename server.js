// server.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Environment variables (zorg dat je deze in Render zet)
const { MONGODB_URI, API_KEY, AI_API_URL } = process.env;
const AI_URL = AI_API_URL || 'https://api.groq.com/openai/v1/chat/completions'; // fallback

// Connect to MongoDB
if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set. Stop.');
  process.exit(1);
}
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('KAVRIX Database Verbonden!'))
  .catch(err => {
    console.error('Database verbindingsfout:', err);
    process.exit(1);
  });

// Schema & Model
const ProjectSchema = new mongoose.Schema({
  name: { type: String, default: 'Nieuw project' },
  userId: { type: String, default: 'anon' },
  files: {
    html: { type: String, default: '' },
    css: { type: String, default: '' },
    js: { type: String, default: '' }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
const Project = mongoose.model('Project', ProjectSchema);

// Helpers
function createSystemPrompt() {
  return `Je bent een Senior Full-Stack Developer. Genereer moderne, functionele frontend code.
Gebruik Tailwind CSS en lucide icons waar mogelijk. Lever output uitsluitend als JSON object met keys "html", "css", "js".
Voorbeeld output JSON: {"html":"...","css":"...","js":"..."}.
Wees zuiver en valideer dat de JSON correct geescaped wordt.`;
}

// ROUTES

// Create a simple project placeholder (optionally not used directly)
app.post('/project', async (req, res) => {
  try {
    const { name, userId } = req.body;
    const p = new Project({ name: name || 'Nieuw project', userId: userId || 'anon' });
    await p.save();
    res.json(p);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Fout bij aanmaken project' });
  }
});

// Generate endpoint - creates DB entry immediately and returns id, then fills later
app.post('/generate', async (req, res) => {
  try {
    const { prompt, userId, existingFiles } = req.body;
    const project = new Project({
      name: prompt ? prompt.substring(0, 40) : 'Nieuw project',
      userId: userId || 'anon',
      files: { html: 'GENERATING', css: '', js: '' }
    });
    await project.save();

    // Return immediately with project id
    res.json({ projectId: project._id });

    // Start AI request in background
    (async () => {
      try {
        const systemPrompt = createSystemPrompt();
        let userContent;
        if (existingFiles && existingFiles.html && existingFiles.html !== 'GENERATING') {
          userContent = `UPDATE deze bestaande app met de volgende wijziging:\n${prompt}\n\nBESTAANDE CODE:\nHTML:\n${existingFiles.html}\n\nCSS:\n${existingFiles.css}\n\nJS:\n${existingFiles.js}`;
        } else {
          userContent = `MAAK deze app:\n${prompt}`;
        }

        const payload = {
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent }
          ],
          response_format: { type: "json_object" }
        };

        const response = await axios.post(AI_URL, payload, {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        });

        // Expecting: response.data.choices[0].message.content is a JSON string
        const raw = response.data?.choices?.[0]?.message?.content;
        let aiJson;
        try {
          aiJson = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch (err) {
          // If parsing fails, try to extract JSON substring
          const maybe = (raw || '').match(/\{[\s\S]*\}/);
          aiJson = maybe ? JSON.parse(maybe[0]) : null;
        }

        if (!aiJson || (!aiJson.html && !aiJson.css && !aiJson.js)) {
          // fallback: store raw response for debugging
          await Project.findByIdAndUpdate(project._id, {
            files: {
              html: `<pre style="color:white;background:#111;padding:16px;">AI response parsing error. Raw: ${String(raw).slice(0, 2000)}</pre>`,
              css: '',
              js: ''
            },
            updatedAt: new Date()
          });
          return;
        }

        // Save AI result into database
        await Project.findByIdAndUpdate(project._id, {
          files: {
            html: aiJson.html || '',
            css: aiJson.css || '',
            js: aiJson.js || ''
          },
          updatedAt: new Date()
        });
      } catch (err) {
        console.error('AI generation error:', err?.message || err);
        // Mark project failed but keep placeholder
        await Project.findByIdAndUpdate(project._id, {
          files: {
            html: '<div style="color:white;padding:32px;text-align:center;"><h2>Generatie mislukt</h2><p>Probeer het nogmaals.</p></div>',
            css: '',
            js: ''
          },
          updatedAt: new Date()
        });
      }
    })();

  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Fout bij starten generatie' });
  }
});

// Get single project
app.get('/project/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).lean();
    if (!project) return res.status(404).json({ message: 'Niet gevonden' });
    res.json(project);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Fout bij ophalen project' });
  }
});

// List projects for a user
app.get('/projects/:userId', async (req, res) => {
  try {
    const userId = req.params.userId || 'anon';
    const projects = await Project.find({ userId }).sort({ updatedAt: -1 }).lean();
    // return minimal info for list
    const summary = projects.map(p => ({ id: p._id, name: p.name }));
    res.json(summary);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Fout bij ophalen projecten' });
  }
});

// Delete project
app.delete('/project/:id', async (req, res) => {
  try {
    await Project.findByIdAndDelete(req.params.id);
    return res.status(200).json({ message: 'Project verwijderd' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Fout bij verwijderen' });
  }
});

// Rename or update simple metadata (PATCH)
app.patch('/project/:id', async (req, res) => {
  try {
    const updates = {};
    if (req.body.name) updates.name = req.body.name;
    if (Object.keys(updates).length === 0) return res.status(400).json({ message: 'Niets om te updaten' });
    updates.updatedAt = new Date();
    const updated = await Project.findByIdAndUpdate(req.params.id, updates, { new: true }).lean();
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Fout bij bijwerken' });
  }
});

// Export project as downloadable HTML file
app.get('/export/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).lean();
    if (!project) return res.status(404).send('Niet gevonden');

    const { html, css, js } = project.files || {};
    const full = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${project.name || 'KAVRIX export'}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
${html || ''}
<style>${css || ''}</style>
<script>${js || ''}<\/script>
</body>
</html>`;

    res.setHeader('Content-Disposition', `attachment; filename="kavrix-project-${project._id}.html"`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(full);
  } catch (e) {
    console.error(e);
    res.status(500).send('Fout bij exporteren');
  }
});

// Health & root
app.get('/', (req, res) => res.send('KAVRIX Engine running'));
app.get('/health', (req, res) => res.json({ ok: true }));

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`KAVRIX Engine draait op poort ${PORT}`));
