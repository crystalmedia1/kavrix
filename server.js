const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Supabase configuratie (gebruikt de Service Role Key uit Render)
const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_KEY || "");
const API_KEY = process.env.API_KEY;

// Proxy voor live data (voorkomt CORS fouten in je apps)
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
    // We gebruiken het 8b-instant model voor maximale snelheid en hogere limieten
    let apiUrl = "https://api.groq.com/openai/v1/chat/completions";
    let model = "llama-3.1-8b-instant"; 

    // Automatische detectie voor Abacus/RouteLLM keys
    if (API_KEY && !API_KEY.startsWith("gsk_")) {
        apiUrl = "https://routellm.abacus.ai/v1/chat/completions";
        model = "route-llm";
    }

    try {
        const response = await axios.post(apiUrl, {
            model: model,
            messages: [
                { 
                    role: "system", 
                    content: `Je bent KAVRIX DEEP-ENGINE v12.0. Je bouwt luxe, moderne web-apps.
                    
                    DESIGN RICHTLIJNEN:
                    1. UI: Ultra-modern, donker thema (bg-[#020617]), Glassmorphism (bg-white/5 backdrop-blur-2xl border border-white/10).
                    2. UX: Gebruik afgeronde hoeken (rounded-[32px]), grote paddings, en vloeiende transities.
                    3. FONTS: Gebruik 'Plus Jakarta Sans' via Google Fonts.
                    4. COMPONENTEN: Gebruik Lucide Icons en Chart.js voor data.
                    
                    TECHNISCH:
                    - Gebruik Tailwind CSS via CDN.
                    - Schrijf volledige, werkende JavaScript.
                    - Gebruik de proxy voor API calls: https://kavrix.onrender.com/api/proxy?url=...
                    
                    Geef ALLEEN de volledige HTML code terug, beginnend met <!DOCTYPE html>.` 
                },
                { role: "user", content: `CONTEXT (Vorige Code):\n${previousCode}\n\nOPDRACHT: ${prompt}` }
            ],
            temperature: 0.2
        }, { 
            headers: { "Authorization": `Bearer ${API_KEY}` },
            timeout: 120000 
        });
        
        let code = response.data.choices[0].message.content;
        return code.replace(/```(?:html)?/gi, "").replace(/```/g, "").trim();
    } catch (error) {
        console.error("AI Error Details:", error.response ? error.response.data : error.message);
        throw new Error("AI Verbinding mislukt of limiet bereikt. Probeer het over een paar minuten opnieuw.");
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

        // Achtergrond proces voor het genereren van de code
        callDeepEngine(prompt, previousCode).then(async (finalCode) => {
            // Genereer een passende naam voor het project
            const nameResponse = await axios.post(apiUrl, {
                model: "llama-3.1-8b-instant",
                messages: [{ role: "user", content: `Geef een korte, luxe naam (max 2 woorden) voor deze app: ${prompt}. Geef alleen de naam.` }]
            }, { headers: { "Authorization": `Bearer ${API_KEY}` } }).catch(() => ({ data: { choices: [{ message: { content: "Nieuw Project" } }] } }));
            
            const newName = nameResponse.data.choices[0].message.content.replace(/"/g, "").trim();
            await supabase.from("projects").update({ code: finalCode, name: newName }).eq("id", id);
        }).catch(async (err) => {
            await supabase.from("projects").update({ code: "FOUT: " + err.message }).eq("id", id);
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

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
app.listen(PORT, () => console.log(`Kavrix Engine v12.0 Online`));

process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));
