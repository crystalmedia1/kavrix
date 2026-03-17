const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_KEY || "");
const API_KEY = process.env.API_KEY;

// We gebruiken Groq direct voor maximale snelheid en stabiliteit
const AI_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const AI_MODEL = "llama-3.3-70b-versatile"; 

// Proxy voor live data
app.get("/api/proxy", async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: "URL is verplicht" });
    try {
        const response = await axios.get(targetUrl, { timeout: 10000 });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "Proxy Error: " + error.message });
    }
});

async function callDeepEngine(prompt, previousCode = "") {
    try {
        const response = await axios.post(AI_API_URL, {
            model: AI_MODEL,
            messages: [
                { 
                    role: "system", 
                    content: `Je bent KAVRIX DEEP-ENGINE v10.0, een elite AI App Builder.
                    
                    JOUW STIJL-GIDS (STRIKT VOLGEN):
                    1. UI: Ultra-modern, donker thema (bg-[#020617]), Glassmorphism (bg-white/5 backdrop-blur-2xl border border-white/10).
                    2. UX: Gebruik afgeronde hoeken (rounded-[32px]), grote paddings, en vloeiende transities.
                    3. FONTS: Gebruik 'Plus Jakarta Sans' via Google Fonts.
                    4. COMPONENTEN: Gebruik Lucide Icons en Chart.js voor data.
                    
                    TECHNISCH:
                    - Gebruik Tailwind CSS via CDN.
                    - Schrijf volledige, werkende JavaScript.
                    - Gebruik de proxy voor API calls: https://kavrix.onrender.com/api/proxy?url=...
                    
                    Geef ALLEEN de volledige HTML code terug.` 
                },
                { role: "user", content: `CONTEXT:\n${previousCode}\n\nOPDRACHT: ${prompt}` }
            ],
            temperature: 0.2
        }, { 
            headers: { "Authorization": `Bearer ${API_KEY}` },
            timeout: 120000 // Verhoogd naar 2 minuten voor grote apps
        });
        
        let code = response.data.choices[0].message.content;
        return code.replace(/```(?:html)?/gi, "").replace(/```/g, "").trim();
    } catch (error) {
        console.error("AI Error:", error.response ? error.response.data : error.message);
        throw new Error("De AI-verbinding is mislukt. Controleer je API-key of probeer het opnieuw.");
    }
}

app.post("/generate", async (req, res) => {
    const { prompt, projectId } = req.body;
    try {
        let id = projectId;
        let previousCode = "";

        if (id) {
            const { data } = await supabase.from("projects").select("code").eq("id", id).single();
            previousCode = data ? data.code : "";
        }

        if (!id) {
            const { data, error } = await supabase.from("projects").insert([{ name: "Genereren...", code: "GENERATING", prompt: prompt }]).select();
            if (error) throw error;
            id = data[0].id;
        } else {
            await supabase.from("projects").update({ code: "GENERATING", prompt: prompt }).eq("id", id);
        }

        res.json({ projectId: id });

        // Achtergrond proces
        callDeepEngine(prompt, previousCode).then(async (finalCode) => {
            // Naam verzinnen
            const nameResponse = await axios.post(AI_API_URL, {
                model: "llama-3.1-8b-instant",
                messages: [{ role: "user", content: `Korte naam (2 woorden) voor: ${prompt}. Alleen de naam.` }]
            }, { headers: { "Authorization": `Bearer ${API_KEY}` } });
            
            const newName = nameResponse.data.choices[0].message.content.replace(/"/g, "").trim();
            await supabase.from("projects").update({ code: finalCode, name: newName }).eq("id", id);
        }).catch(async (err) => {
            await supabase.from("projects").update({ code: "FOUT: " + err.message }).eq("id", id);
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Overige routes...
app.get("/projects", async (req, res) => {
    try {
        const { data } = await supabase.from("projects").select("id, name, created_at").order("created_at", { ascending: false });
        res.json(data || []);
    } catch (e) { res.json([]); }
});

app.get("/project/:id", async (req, res) => {
    try {
        const { data } = await supabase.from("projects").select("*").eq("id", req.params.id).single();
        res.json(data);
    } catch (e) { res.status(404).json({ error: "Niet gevonden" }); }
});

app.delete("/delete-project/:id", async (req, res) => {
    try {
        await supabase.from("projects").delete().eq("id", req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kavrix Engine v10.0 Online`));

process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));
