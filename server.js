const express = require('express');
const cors = require('cors');
const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// VERBINDING MET MONGODB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("KAVRIX Database Verbonden!"))
    .catch(err => console.error("Database Fout:", err));

// DATABASE SCHEMA
const ProjectSchema = new mongoose.Schema({
    name: String,
    userId: String,
    files: { html: String, css: String, js: String },
    createdAt: { type: Date, default: Date.now }
});
const Project = mongoose.model('Project', ProjectSchema);

app.post('/generate', async (req, res) => {
    const { prompt, userId, existingFiles } = req.body;
    
    // Maak project aan in database
    const newProject = new Project({
        name: prompt.substring(0, 20),
        userId: userId || "user_123",
        files: { html: "GENERATING", css: "", js: "" }
    });
    await newProject.save();
    
    res.json({ projectId: newProject._id });

    try {
        const systemPrompt = `Je bent een Senior Full-Stack Developer. Maak een moderne, functionele app.
        GEBRUIK: Tailwind CSS, Lucide Icons, Google Fonts.
        LIVE DATA: Gebruik fetch() voor gratis API's (Crypto/Weer).
        FOTO'S: <img src="https://loremflickr.com/800/600/[TOPIC]">.
        OUTPUT: JSON {"html": "...", "css": "...", "js": "..."}`;

        let userContent = `Maak deze app: ${prompt}`;
        if (existingFiles && existingFiles.html && existingFiles.html !== "GENERATING") {
            userContent = `UPDATE CODE:\nHTML: ${existingFiles.html}\nWIJZIGING: ${prompt}`;
        }

        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent }
            ],
            response_format: { type: "json_object" }
        }, {
            headers: { 'Authorization': `Bearer ${process.env.API_KEY}` },
            timeout: 45000
        });

        const aiResponse = JSON.parse(response.data.choices[0].message.content);
        await Project.findByIdAndUpdate(newProject._id, { files: aiResponse });

    } catch (error) {
        console.error("AI FOUT:", error.message);
        await Project.findByIdAndUpdate(newProject._id, { 
            files: { html: "<div style='color:white;text-align:center;padding:50px;'><h1>AI is even druk...</h1><p>Probeer het over 10 seconden opnieuw.</p></div>", css: "", js: "" } 
        });
    }
});

app.get('/project/:id', async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);
        res.json(project || { files: null });
    } catch (e) { res.json({ files: null }); }
});

app.get('/projects/:userId', async (req, res) => {
    try {
        const userProjects = await Project.find({ userId: req.params.userId }).sort({ createdAt: -1 });
        res.json(userProjects.map(p => ({ id: p._id, name: p.name })));
    } catch (e) { res.json([]); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`KAVRIX Engine draait op poort ${PORT}`));
