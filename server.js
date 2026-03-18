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

// --- ULTIMATE ENGINE LOGICA v17.0 ---
async function processAIRequest(prompt, previousCode, projectId) {
    try {
        // STAP 1: ARCHITECT (Bouwt de App)
        const architectResponse = await axios.post(AI_API_URL, {
            model: AI_MODEL,
            messages: [
                { 
                    role: "system", 
                    content: `Je bent de KAVRIX ULTIMATE ARCHITECT. 
                    Bouw luxe apps/games met Tailwind CSS. 
                    Voor E-commerce: Maak een werkende winkelwagen.
                    Voor Social Media: Maak een werkende 'like' knop en comments.
                    Voor Admin: Gebruik Chart.js voor data.
                    Geef ALLEEN de ruwe HTML code terug.` 
                },
                { role: "user", content: `CONTEXT:\n${previousCode}\n\nOPDRACHT: ${prompt}` }
            ]
        }, { headers: { "Authorization": `Bearer ${API_KEY}` }, timeout: 180000 });

        let rawCode = architectResponse.data.choices[0].message.content;

        // STAP 2: REVIEWER (Schoont de code op)
        const reviewerResponse = await axios.post(AI_API_URL, {
            model: "llama-3.1-8b-instant",
            messages: [
                { role: "system", content: "Je bent de KAVRIX REVIEWER. Verwijder alle tekst die geen code is. Begin met <!DOCTYPE html> en eindig met </html>." },
                { role: "user", content: rawCode }
            ]
        }, { headers: { "Authorization": `Bearer ${API_KEY}` }, timeout: 90000 });

        let finalCode = reviewerResponse.data.choices[0].message.content;
        if (finalCode.includes("<​/html>")) finalCode = finalCode.split("<​/html>")[0] + "<​/html>";
        finalCode = finalCode.replace(/```(?:html)?/gi, "").replace(/```/g, "").trim();

        // STAP 3: NAAM GENEREREN (Gefixeerd op max 20 tekens)
        const nameResponse = await axios.post(AI_API_URL, {
            model: "llama-3.1-8b-instant",
            messages: [{ role: "user", content: `Geef een ZEER KORTE naam (max 15 tekens, GEEN code, GEEN leestekens) voor dit project: ${prompt}` }]
        }, { headers: { "Authorization": `Bearer ${API_KEY}` } }).catch(() => ({ data: { choices: [{ message: { content: "Nieuw Project" } }] } }));
        
        let newName = nameResponse.data.choices[0].message.content.replace(/[#*"`]/g, "").trim().substring(0, 15).toUpperCase();

        // STAP 4: DATABASE UPDATEN
        await supabase.from("projects").update({ code: finalCode, name: newName }).eq("id", projectId);

    } catch (error) {
        await supabase.from("projects").update({ code: "FOUT: De AI is overbelast. Probeer het opnieuw." }).eq("id", projectId);
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
            const { data, error } = await supabase.from("projects").insert([{ name: "DENKT NA...", code: "GENERATING", prompt: prompt }]).select();
            if (error) throw error;
            id = data[0].id;
        } else {
            await supabase.from("projects").update({ code: "GENERATING", prompt: prompt }).eq("id", id);
        }

        res.json({ projectId: id });
        processAIRequest(prompt, previousCode, id);

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
app.listen(PORT, () => console.log(`Kavrix Ultimate Engine v17.0 Online`));
