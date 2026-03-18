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

// --- HYBRID CONFIG ---
let AI_API_URL = "https://api.groq.com/openai/v1/chat/completions";
let AI_MODEL = "llama-3.3-70b-versatile"; 

if (API_KEY && !API_KEY.startsWith("gsk_")) {
    AI_API_URL = "https://routellm.abacus.ai/v1/chat/completions";
    AI_MODEL = "route-llm";
}

// Proxy voor live data
app.get("/api/proxy", async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: "URL is verplicht" });
    try {
        const response = await axios.get(targetUrl, { timeout: 10000 });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "Proxy Error" });
    }
});

async function callDeepEngine(prompt, previousCode = "") {
    try {
        // We proberen eerst het slimme model, als dat faalt schakelen we over
        const response = await axios.post(AI_API_URL, {
            model: AI_MODEL,
            messages: [
                { 
                    role: "system", 
                    content: `Je bent KAVRIX DEEP-ENGINE v13.1. Bouw een pixel-perfecte, luxe web-app.
                    STIJL: Donker thema (#020617), Glassmorphism, Tailwind CSS, Lucide Icons.
                    Geef ALLEEN de volledige HTML code terug.` 
                },
                { role: "user", content: `CONTEXT:\n${previousCode}\n\nOPDRACHT: ${prompt}` }
            ],
            temperature: 0.2
        }, { 
            headers: { "Authorization": `Bearer ${API_KEY}` },
            timeout: 50000 // Kortere timeout om 'hangen' te voorkomen
        });
        
        let code = response.data.choices[0].message.content;
        return code.replace(/```(?:html)?/gi, "").replace(/```/g, "").trim();
    } catch (error) {
        console.error("Switching to Fast Mode...");
        // FALLBACK naar het snellere model als het grote model te traag is
        const fallbackResponse = await axios.post(AI_API_URL, {
            model: "llama-3.1-8b-instant",
            messages: [
                { role: "system", content: "Bouw een luxe web-app met Tailwind CSS. Geef alleen HTML." },
                { role: "user", content: prompt }
            ]
        }, { headers: { "Authorization": `Bearer ${API_KEY}` } });
        
        let code = fallbackResponse.data.choices[0].message.content;
        return code.replace(/```(?:html)?/gi, "").replace(/```/g, "").trim();
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
            const { data, error } = await supabase.from("projects").insert([{ name: "Nadenken...", code: "GENERATING", prompt: prompt }]).select();
            if (error) throw error;
            id = data[0].id;
        } else {
            await supabase.from("projects").update({ code: "GENERATING", prompt: prompt }).eq("id", id);
        }

        res.json({ projectId: id });

        callDeepEngine(prompt, previousCode).then(async (finalCode) => {
            await supabase.from("projects").update({ code: finalCode, name: prompt.substring(0, 20) }).eq("id", id);
        }).catch(async (err) => {
            await supabase.from("projects").update({ code: "FOUT: " + err.message }).eq("id", id);
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kavrix Engine v13.1 Online`));
