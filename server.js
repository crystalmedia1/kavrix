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
let AI_MODEL = "llama-3.3-70b-versatile"; // Het slimste model voor maximale kwaliteit

if (API_KEY && !API_KEY.startsWith("gsk_")) {
    AI_API_URL = "https://routellm.abacus.ai/v1/chat/completions";
    AI_MODEL = "route-llm";
}

// --- LIVE DATA PROXY ---
// Hiermee kan jouw AI live data ophalen van externe API's zonder CORS-fouten
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
        res.status(500).json({ error: "Proxy Error: " + error.message });
    }
});

// --- DEEP ENGINE LOGICA ---
async function callDeepEngine(prompt, previousCode = "") {
    try {
        const response = await axios.post(AI_API_URL, {
            model: AI_MODEL,
            messages: [
                { 
                    role: "system", 
                    content: `Je bent KAVRIX DEEP-ENGINE v14.0. Je bent een elite Full-Stack Developer en UI/UX Designer.
                    
                    JOUW OPDRACHT:
                    Bouw een applicatie die visueel verbluffend is en technisch superieur aan Abacus.ai.
                    
                    DESIGN SYSTEEM (STRIKT VOLGEN):
                    - Kleurenpalet: Deep Space (#020617), Indigo Glow (#6366f1), en Emerald Accent voor succes.
                    - UI: Gebruik 'Glassmorphism' (bg-white/5, backdrop-blur-xl, border-white/10).
                    - Animatie: Voeg subtiele CSS-animaties toe (@keyframes) voor het laden van elementen.
                    - Layout: Gebruik CSS Grid voor complexe dashboards en Flexbox voor navigatie.
                    - Fonts: Gebruik 'Plus Jakarta Sans' via Google Fonts.
                    
                    FUNCTIONALITEIT:
                    - Gebruik Lucide Icons (https://unpkg.com/lucide@latest) voor een moderne look.
                    - Gebruik Chart.js voor alle data-visualisaties en grafieken.
                    - Als de gebruiker vraagt om live data (weer, crypto, nieuws, films), gebruik dan fetch() naar onze proxy: 
                      'https://kavrix.onrender.com/api/proxy?url=[DOEL_URL]'
                    
                    OUTPUT:
                    Geef ALLEEN de volledige HTML code terug, inclusief CSS en JS in één bestand. Geen praatjes. Begin direct met <!DOCTYPE html>.` 
                },
                { role: "user", content: `PROJECT CONTEXT (Vorige Code):\n${previousCode}\n\nNIEUWE OPDRACHT: ${prompt}\n\nMaak er een meesterwerk van.` }
            ],
            temperature: 0.3
        }, { 
            headers: { "Authorization": `Bearer ${API_KEY}` },
            timeout: 150000 
        });
        
        let code = response.data.choices[0].message.content;
        return code.replace(/```(?:html)?/gi, "").replace(/```/g, "").trim();
    } catch (error) {
        console.error("AI Error, switching to Fallback Mode...");
        // FALLBACK naar het snellere 8b model als het grote model te traag is of een fout geeft
        try {
            const fallback = await axios.post(AI_API_URL, {
                model: "llama-3.1-8b-instant",
                messages: [
                    { role: "system", content: "Bouw een luxe, moderne HTML app met Tailwind CSS. Geef alleen de code." },
                    { role: "user", content: prompt }
                ]
            }, { headers: { "Authorization": `Bearer ${API_KEY}` } });
            
            let code = fallback.data.choices[0].message.content;
            return code.replace(/```(?:html)?/gi, "").replace(/```/g, "").trim();
        } catch (fallbackError) {
            throw new Error("DeepEngine is momenteel overbelast. Probeer het over 30 seconden opnieuw.");
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

        // Achtergrond proces voor generatie
        callDeepEngine(prompt, previousCode).then(async (finalCode) => {
            // Genereer een korte naam voor het project
            const nameResponse = await axios.post(AI_API_URL, {
                model: "llama-3.1-8b-instant",
                messages: [{ role: "user", content: `Geef een korte, krachtige naam (max 2 woorden) voor deze app: ${prompt}. Geef alleen de naam.` }]
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
app.listen(PORT, () => console.log(`Kavrix Engine v14.0 Online`));

process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));
