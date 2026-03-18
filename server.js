const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// --- DATABASE CONFIG ---
const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_KEY || "");
const API_KEY = process.env.API_KEY;

// --- AI ENGINE CONFIG ---
let AI_API_URL = "https://api.groq.com/openai/v1/chat/completions";
let AI_MODEL = "llama-3.3-70b-versatile"; 

if (API_KEY && !API_KEY.startsWith("gsk_")) {
    AI_API_URL = "https://routellm.abacus.ai/v1/chat/completions";
    AI_MODEL = "route-llm";
}

// --- LIVE DATA PROXY ---
app.get("/api/proxy", async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: "URL is verplicht" });
    try {
        const response = await axios.get(targetUrl, { 
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "Proxy Error" });
    }
});

// --- DEEP ENGINE LOGICA v15.0 ---
async function callDeepEngine(prompt, previousCode = "") {
    try {
        const response = await axios.post(AI_API_URL, {
            model: AI_MODEL,
            messages: [
                { 
                    role: "system", 
                    content: `Je bent KAVRIX DEEP-ENGINE v15.0. Je bent een wereldklasse Full-Stack Developer en Game Designer.
                    
                    JOUW EXPERTISE:
                    1. APPS: Bouw luxe dashboards met Glassmorphism, Tailwind CSS en Chart.js.
                    2. GAMES: Gebruik HTML5 Canvas voor games. Implementeer een 'requestAnimationFrame' loop, collision detection, en soepele controls.
                    3. DATA: Gebruik ALTIJD de proxy voor externe data: fetch('https://kavrix.onrender.com/api/proxy?url=' + encodeURIComponent(URL))
                    
                    DESIGN RICHTLIJNEN:
                    - Thema: Deep Space (#020617), Indigo Glow, Neon Accents.
                    - Fonts: 'Plus Jakarta Sans'.
                    - Icons: Lucide Icons (https://unpkg.com/lucide@latest).
                    
                    OUTPUT:
                    Geef ALLEEN de volledige HTML code terug. Geen uitleg. Begin direct met <!DOCTYPE html>.` 
                },
                { role: "user", content: `CONTEXT (Vorige Code):\n${previousCode}\n\nOPDRACHT: ${prompt}\n\nMaak een technisch meesterwerk.` }
            ],
            temperature: 0.3
        }, { 
            headers: { "Authorization": `Bearer ${API_KEY}` },
            timeout: 150000 
        });
        
        let code = response.data.choices[0].message.content;
        return code.replace(/```(?:html)?/gi, "").replace(/```/g, "").trim();
    } catch (error) {
        console.error("AI Error, switching to Fallback...");
        try {
            const fallback = await axios.post(AI_API_URL, {
                model: "llama-3.1-8b-instant",
                messages: [
                    { role: "system", content: "Bouw een luxe HTML app of game met Tailwind CSS. Geef alleen de code." },
                    { role: "user", content: prompt }
                ]
            }, { headers: { "Authorization": `Bearer ${API_KEY}` } });
            
            let code = fallback.data.choices[0].message.content;
            return code.replace(/```(?:html)?/gi, "").replace(/```/g, "").trim();
        } catch (fallbackError) {
            throw new Error("DeepEngine is momenteel overbelast.");
        }
    }
}

// --- API ROUTES ---
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
            const { data, error } = await supabase.from("projects").insert([{ name: "DeepEngine denkt na...", code: "GENERATING", prompt: prompt }]).select();
            if (error) throw error;
            id = data[0].id;
        } else {
            await supabase.from("projects").update({ code: "GENERATING", prompt: prompt }).eq("id", id);
        }

        res.json({ projectId: id });

        callDeepEngine(prompt, previousCode).then(async (finalCode) => {
            const nameResponse = await axios.post(AI_API_URL, {
                model: "llama-3.1-8b-instant",
                messages: [{ role: "user", content: `Korte naam (max 2 woorden) voor: ${prompt}. Alleen de naam.` }]
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
app.listen(PORT, () => console.log(`Kavrix Engine v15.0 Online`));
