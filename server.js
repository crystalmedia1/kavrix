const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const API_KEY = process.env.API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// --- NIEUW: LIVE DATA PROXY ---
app.get("/api/proxy", async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: "URL is verplicht" });
    try {
        const response = await axios.get(targetUrl);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "Proxy Error: " + error.message });
    }
});

async function callDeepEngine(prompt, previousCode = "") {
    const response = await axios.post(GROQ_API_URL, {
        model: "llama-3.3-70b-versatile",
        messages: [
            { 
                role: "system", 
                content: `Je bent KAVRIX DEEP-ENGINE v5.0. Je bouwt enterprise-grade web-apps.
                RICHTLIJNEN:
                1. Gebruik Tailwind CSS, Lucide Icons (via UNPKG) en Chart.js.
                2. Voor live data, gebruik fetch naar: ${process.env.RENDER_EXTERNAL_URL}/api/proxy?url=HIER_DE_URL
                3. Maak de UI extreem luxe: gebruik subtiele gradients, glassmorphism en animaties.
                4. Geef ALLEEN de volledige HTML code terug.` 
            },
            { role: "user", content: `CONTEXT:\n${previousCode}\n\nOPDRACHT: ${prompt}` }
        ],
        temperature: 0.2
    }, { headers: { "Authorization": `Bearer ${API_KEY}` } });
    
    let code = response.data.choices[0].message.content;
    return code.replace(/```(?:html)?/gi, "").replace(/```/g, "").trim();
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
            const { data } = await supabase.from("projects").insert([{ 
                name: "Nieuw Project...", 
                code: "GENERATING", 
                prompt: prompt 
            }]).select();
            id = data[0].id;
        } else {
            await supabase.from("projects").update({ code: "GENERATING", prompt: prompt }).eq("id", id);
        }

        res.json({ projectId: id });

        // Achtergrond proces
        callDeepEngine(prompt, previousCode).then(async (finalCode) => {
            // Extra stap: Laat AI een naam verzinnen
            const nameResponse = await axios.post(GROQ_API_URL, {
                model: "llama-3.1-8b-instant",
                messages: [{ role: "user", content: `Verzin een korte, krachtige naam (max 2 woorden) voor deze app opdracht: ${prompt}. Geef alleen de naam.` }]
            }, { headers: { "Authorization": `Bearer ${API_KEY}` } });
            
            const newName = nameResponse.data.choices[0].message.content.replace(/"/g, "").trim();
            await supabase.from("projects").update({ code: finalCode, name: newName }).eq("id", id);
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/projects", async (req, res) => {
    const { data } = await supabase.from("projects").select("id, name, created_at").order("created_at", { ascending: false });
    res.json(data || []);
});

app.get("/project/:id", async (req, res) => {
    const { data } = await supabase.from("projects").select("*").eq("id", req.params.id).single();
    res.json(data);
});

app.delete("/delete-project/:id", async (req, res) => {
    await supabase.from("projects").delete().eq("id", req.params.id);
    res.json({ success: true });
});

app.listen(process.env.PORT || 3000, () => console.log("Kavrix Engine v5.0 Online"));
