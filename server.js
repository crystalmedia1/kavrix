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

// Proxy voor live data
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
                content: `Je bent KAVRIX DEEP-ENGINE v7.0. Je bouwt uitsluitend ULTRA-LUXE web-apps.
                
                STRICTE STIJL-GIDS:
                1. Achtergrond: ALTIJD een zeer donkere gradient (bg-slate-950).
                2. Kaarten/Containers: Gebruik Glassmorphism (bg-white/5 backdrop-blur-xl border border-white/10 rounded-[32px] p-8).
                3. Fonts: Gebruik 'Plus Jakarta Sans' of 'Inter' met font-black voor titels.
                4. Kleuren: Gebruik Indigo-500, Violet-500 en Emerald-500 voor accenten.
                5. JavaScript: Zorg dat data-fetching via de proxy vlekkeloos werkt.
                
                MASTER TEMPLATE STRUCTUUR:
                Gebruik altijd deze basis:
                <!DOCTYPE html>
                <html>
                <head>
                    <script src="https://cdn.tailwindcss.com"></script>
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
                    <style>body { background: #020617; color: white; font-family: 'Inter', sans-serif; }</style>
                </head>
                <body class="min-h-screen p-8 md:p-12">
                    <div class="max-w-6xl mx-auto">
                        <!-- HIER DE CONTENT DIE JE BOUWT -->
                    </div>
                </body>
                </html>
                
                Geef ALLEEN de volledige HTML code terug.` 
            },
            { role: "user", content: `CONTEXT:\n${previousCode}\n\nOPDRACHT: ${prompt}` }
        ],
        temperature: 0.1 // Extreem laag voor maximale precisie
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

app.listen(process.env.PORT || 3000, () => console.log("Kavrix Engine v7.0 Online"));
