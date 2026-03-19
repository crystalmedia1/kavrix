const express = require('express');
const cors = require('cors');
const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Extra ruimte voor grote apps

// 1. DATABASE VERBINDING
const { MONGODB_URI, API_KEY } = process.env;

mongoose.connect(MONGODB_URI)
    .then(() => console.log("KAVRIX Database Verbonden!"))
    .catch(err => {
        console.error("Database Fout:", err);
        process.exit(1);
    });

// 2. DATABASE SCHEMA (Alles wordt onthouden)
const ProjectSchema = new mongoose.Schema({
    name: { type: String, default: 'Nieuw Project' },
    userId: { type: String, default: 'user_123' },
    files: {
        html: { type: String, default: '' },
        css: { type: String, default: '' },
        js: { type: String, default: '' }
    },
    history: [{
        prompt: String,
        timestamp: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
const Project = mongoose.model('Project', ProjectSchema);

// 3. AI GENERATIE ENGINE (Smart Iteration)
app.post('/generate', async (req, res) => {
    const { prompt, userId, existingFiles, projectId } = req.body;
    
    try {
        let project;
        if (projectId) {
            project = await Project.findById(projectId);
        } else {
            project = new Project({
                name: prompt.substring(0, 30),
                userId: userId || "user_123",
                files: { html: "GENERATING", css: "", js: "" }
            });
            await project.save();
        }
        
        // Stuur direct het ID terug zodat de frontend kan gaan pollen
        res.json({ projectId: project._id });

        // Start AI proces in de achtergrond
        (async () => {
            try {
                const isUpdate = existingFiles && existingFiles.html && existingFiles.html !== "GENERATING";
                
                const systemPrompt = `Je bent KAVRIX PRO AI, een Senior Full-Stack Developer.
                STIJL: Modern, strak, donker thema (slate-900), Tailwind CSS, Lucide Icons.
                LIVE DATA: Gebruik fetch() voor echte koersen (Crypto/Weer).
                OUTPUT: Lever ALTIJD een JSON object: {"html": "...", "css": "...", "js": "..."}.
                ${isUpdate ? "BELANGRIJK: Je krijgt de huidige code. Behoud de bestaande functies en pas ENKEL aan wat gevraagd wordt. Lever de VOLLEDIGE nieuwe code terug." : "Maak een volledig nieuwe app vanaf nul."}`;

                const userContent = isUpdate 
                    ? `HUIDIGE CODE:\nHTML: ${existingFiles.html}\nCSS: ${existingFiles.css}\nJS: ${existingFiles.js}\n\nGEWENSTE WIJZIGING: ${prompt}`
                    : `MAAK NIEUWE APP: ${prompt}`;

                const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userContent }
                    ],
                    response_format: { type: "json_object" }
                }, {
                    headers: { 'Authorization': `Bearer ${API_KEY}` },
                    timeout: 60000
                });

                const aiResponse = JSON.parse(response.data.choices[0].message.content);
                
                await Project.findByIdAndUpdate(project._id, { 
                    files: aiResponse,
                    $push: { history: { prompt: prompt } },
                    updatedAt: new Date()
                });

            } catch (err) {
                console.error("AI FOUT:", err.message);
                await Project.findByIdAndUpdate(project._id, { 
                    files: { html: "<div class='p-10 text-white'>AI is even druk. Probeer het opnieuw.</div>", css: "", js: "" } 
                });
            }
        })();

    } catch (e) {
        res.status(500).json({ error: "Server Fout" });
    }
});

// 4. PROJECT OPHALEN
app.get('/project/:id', async (req, res) => {
    try {
        const project = await Project.findById(req.params.id).lean();
        if (!project) return res.status(404).json({ error: "Niet gevonden" });
        res.json(project);
    } catch (e) { res.status(500).json({ error: "Fout bij ophalen" }); }
});

// 5. LIJST MET PROJECTEN (Voor de Sidebar)
app.get('/projects/:userId', async (req, res) => {
    try {
        const projects = await Project.find({ userId: req.params.userId }).sort({ updatedAt: -1 }).lean();
        res.json(projects.map(p => ({ id: p._id, name: p.name })));
    } catch (e) { res.json([]); }
});

// 6. PROJECT VERWIJDEREN
app.delete('/project/:id', async (req, res) => {
    try {
        await Project.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Verwijderen mislukt" }); }
});

// 7. PROJECT HERNOEMEN (PATCH)
app.patch('/project/:id', async (req, res) => {
    try {
        const { name } = req.body;
        const updated = await Project.findByIdAndUpdate(req.params.id, { name, updatedAt: new Date() }, { new: true });
        res.json(updated);
    } catch (e) { res.status(500).json({ error: "Hernoemen mislukt" }); }
});

// 8. EXPORT NAAR HTML (Download functie)
app.get('/export/:id', async (req, res) => {
    try {
        const project = await Project.findById(req.params.id).lean();
        if (!project) return res.status(404).send("Niet gevonden");

        const fullHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${project.name}</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <script src="https://unpkg.com/lucide@latest"></script>
                <style>${project.files.css}</style>
            </head>
            <body class="bg-slate-900 text-white">
                ${project.files.html}
                <script>
                    lucide.createIcons();
                    ${project.files.js}
                </script>
            </body>
            </html>
        `;

        res.setHeader('Content-Disposition', `attachment; filename="${project.name.replace(/\s+/g, '_')}.html"`);
        res.setHeader('Content-Type', 'text/html');
        res.send(fullHtml);
    } catch (e) { res.status(500).send("Export mislukt"); }
});

// 9. ROOT & HEALTH CHECK
app.get('/', (req, res) => res.send('KAVRIX Master Engine is Online'));
app.get('/health', (req, res) => res.json({ status: "OK", database: mongoose.connection.readyState === 1 }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`KAVRIX Master Engine draait op poort ${PORT}`));
