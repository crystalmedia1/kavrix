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

// --- MULTI-AGENT LOGICA v16.2 ---
async function callDeepEngine(prompt, previousCode = "") {
    try {
        // STAP 1: ARCHITECT (90 sec timeout)
        const architectResponse = await axios.post(AI_API_URL, {
            model: AI_MODEL,
            messages: [
                { 
                    role: "system", 
                    content: `Je bent de KAVRIX ARCHITECT. Bouw een luxe HTML5 app. Gebruik Tailwind CSS flexbox voor een perfecte layout. Geef ALLEEN de ruwe HTML code terug.` 
                },
                { role: "user", content: `CONTEXT:\n${previousCode}\n\nOPDRACHT: ${prompt}` }
            ]
        }, { headers: { "Authorization": `Bearer ${API_KEY}` }, timeout: 120000 });

        let rawCode = architectResponse.data.choices[0].message.content;

        // STAP 2: REVIEWER (Snelle opschoning)
        const reviewerResponse = await axios.post(AI_API_URL, {
            model: "llama-3.1-8b-instant",
            messages: [
                { 
                    role: "system", 
                    content: `Je bent de KAVRIX REVIEWER. Verwijder alle tekst die geen code is. Begin met <!DOCTYPE html> en eindig met </html>.` 
                },
                { role: "user", content: rawCode }
            ]
        }, { headers: { "Authorization": `Bearer ${API_KEY}` }, timeout: 60000 });

        let finalCode = reviewerResponse.data.choices[0].message.content;
        
        if (finalCode.includes("<​/html>")) {
            finalCode = finalCode.split("<​/html>")[0] + "<​/html>";
        }
        
        return finalCode.replace(/```(?:html)?/gi, "").replace(/```/g, "").trim();

    } catch (error) {
        console.error("Timeout of Error:", error.message);
        // Fallback: als de dubbele agent te lang duurt, pakken we de directe output
        return "FOUT: De AI deed er te lang over. Probeer een kortere opdracht of ververs de pagina.";
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
            const { data, error } = await supabase.from("projects").insert([{ name: "DeepEngine analyseert...", code: "GENERATING", prompt: prompt }]).select();
            if (error) throw error;
            id = data[0].id;
        } else {
            await supabase.from("projects").update({ code: "GENERATING", prompt: prompt }).eq("id", id);
        }

        res.json({ projectId: id });

        // We voeren de AI call uit, maar we wachten er niet op voor de response naar de browser
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

// Rest van de routes (projects, project/:id, delete) blijven hetzelfde...
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
app.listen(PORT, () => console.log(`Kavrix Turbo Engine v16.2 Online`));
