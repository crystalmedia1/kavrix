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

// Proxy voor live data (voorkomt $undefined)
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
                content: `Je bent KAVRIX DEEP-ENGINE v6.0. Je bouwt apps van wereldklasse.
                
                TECHNISCHE EISEN:
                1. Gebruik Tailwind CSS voor ALLES.
                2. Gebruik Lucide Icons en Google Fonts (Inter of Poppins).
                3. Voor LIVE DATA (zoals Crypto): Gebruik ALTIJD de proxy route: 
                   https://kavrix.onrender.com/api/proxy?url=HIER_DE_API_URL
                4. Gebruik voor Crypto de CoinGecko API: https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd
                5. UI STIJL: Donker thema, Glassmorphism (bg-white/5 backdrop-blur-lg), afgeronde hoeken (rounded-3xl), en vloeiende animaties.
                6. Zorg dat de JavaScript code robuust is en fouten afhandelt (geen undefined).
                
                Geef ALLEEN de volledige HTML code terug, beginnend met <!DOCTYPE html>.` 
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
            const { data } = await supabase.from("projects").insert([{ name: "Nieuw Project...", code: "GENERATING", prompt: prompt }]).select();
            id = data[0].id;
        } else {
            await supabase.from("projects").update({ code: "GENERATING", prompt: prompt }).eq("id", id);
        }

        res.json({ projectId: id });

        callDeepEngine(prompt, previousCode).then(async (finalCode) => {
            const nameResponse = await axios.post(GROQ_API_URL, {
                model: "llama-3.1-8b-instant",
                messages: [{ role: "user", content: `Verzin een korte naam voor: ${prompt}. Geef alleen de naam.` }]
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

app.listen(process.env.PORT || 3000, () => console.log("Kavrix Engine v6.0 Online"));
