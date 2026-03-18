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

// --- INTELLIGENCE CONFIG ---
let AI_API_URL = "https://api.groq.com/openai/v1/chat/completions";
let AI_MODEL = "llama-3.3-70b-versatile"; // We gaan terug naar het grote model voor maximale kwaliteit

if (API_KEY && !API_KEY.startsWith("gsk_")) {
    AI_API_URL = "https://routellm.abacus.ai/v1/chat/completions";
    AI_MODEL = "route-llm";
}

// Proxy voor live data
app.get("/api/proxy", async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: "URL is verplicht" });
    try {
        const response = await axios.get(targetUrl, { timeout: 15000 });
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
                    content: `Je bent KAVRIX DEEP-ENGINE v13.0, de meest geavanceerde AI App Builder ter wereld. Je bent ontworpen om Abacus.ai te overtreffen in code-kwaliteit en design.

                    JOUW WERKWIJZE:
                    1. ANALYSE: Begrijp de diepere wens van de gebruiker.
                    2. DESIGN: Gebruik een 'Apple-style' luxe interface. Donkere modus (#020617), Glassmorphism, en vloeiende Framer Motion-achtige animaties.
                    3. CODE: Schrijf modulaire, foutloze JavaScript. Gebruik Tailwind CSS v3.4+.
                    4. DATA: Gebruik de proxy voor live API-koppelingen.

                    STIJL-ELEMENTEN:
                    - Gebruik 'Plus Jakarta Sans' font.
                    - Gebruik Lucide Icons (https://unpkg.com/lucide@latest).
                    - Gebruik Chart.js voor alle data-visualisaties.
                    - Containers moeten 'backdrop-blur-2xl bg-white/5 border border-white/10 rounded-[40px]' zijn.

                    Geef ALLEEN de volledige HTML code terug. Geen praatjes, alleen pure code.` 
                },
                { role: "user", content: `CONTEXT (Vorige Code):\n${previousCode}\n\nOPDRACHT: ${prompt}\n\nBouw een meesterwerk.` }
            ],
            temperature: 0.3
        }, { 
            headers: { "Authorization": `Bearer ${API_KEY}` },
            timeout: 150000 
        });
        
        let code = response.data.choices[0].message.content;
        return code.replace(/```(?:html)?/gi, "").replace(/```/g, "").trim();
    } catch (error) {
        console.error("AI Error:", error.message);
        throw new Error("DeepEngine is aan het nadenken. Probeer het over 10 seconden opnieuw.");
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
            const { data, error } = await supabase.from("projects").insert([{ name: "DeepEngine denkt na...", code: "GENERATING", prompt: prompt }]).select();
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
                messages: [{ role: "user", content: `Geef een korte, krachtige naam voor deze app: ${prompt}. Max 2 woorden.` }]
            }, { headers: { "Authorization": `Bearer ${API_KEY}` } }).catch(() => null);
            
            const newName = nameResponse ? nameResponse.data.choices[0].message.content.replace(/"/g, "").trim() : "Kavrix App";
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
app.listen(PORT, () => console.log(`Kavrix Engine v13.0 Online`));
