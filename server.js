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
const ROUTE_LLM_URL = "https://routellm.abacus.ai/v1/chat/completions";

// Proxy voor live data
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
    try {
        const response = await axios.post(ROUTE_LLM_URL, {
            // We gebruiken 'route-llm' voor de beste balans tussen snelheid en intelligentie (Abacus-stijl)
            model: "route-llm", 
            messages: [
                { 
                    role: "system", 
                    content: `Je bent KAVRIX DEEP-ENGINE v9.0, een elite AI App Builder vergelijkbaar met Abacus.ai.
                    
                    JOUW MISSIE:
                    Bouw pixel-perfecte, functionele en moderne web-applicaties op basis van gebruikerswensen.
                    
                    DESIGN PRINCIPES:
                    1. Gebruik Tailwind CSS voor een high-end look.
                    2. Gebruik Lucide Icons voor strakke, consistente iconen.
                    3. Gebruik Google Fonts (Inter of Plus Jakarta Sans).
                    4. UI: Gebruik diepe schaduwen, subtiele gradients, glassmorphism (bg-white/5 backdrop-blur-xl) en afgeronde hoeken (rounded-3xl).
                    5. UX: Voeg hover-effecten, transities en animaties toe (gebruik Framer Motion of CSS transitions).
                    
                    FUNCTIONALITEIT:
                    1. Schrijf SCHONE en MODULAIRE JavaScript.
                    2. Gebruik voor live data ALTIJD de proxy: https://kavrix.onrender.com/api/proxy?url=URL
                    3. Als de gebruiker vraagt om een dashboard, voeg dan interactieve grafieken toe met Chart.js.
                    
                    OUTPUT:
                    Geef ALLEEN de volledige, werkende HTML code terug. Geen uitleg, geen markdown blokken.` 
                },
                { role: "user", content: `CONTEXT (Vorige Code):\n${previousCode}\n\nNIEUWE OPDRACHT: ${prompt}\n\nBouw een complete, luxe oplossing.` }
            ],
            temperature: 0.3
        }, { 
            headers: { "Authorization": `Bearer ${API_KEY}` },
            timeout: 90000 
        });
        
        let code = response.data.choices[0].message.content;
        return code.replace(/```(?:html)?/gi, "").replace(/```/g, "").trim();
    } catch (error) {
        console.error("AI Error:", error.message);
        throw new Error("De DeepEngine is momenteel druk. Probeer het over enkele seconden opnieuw.");
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

        // Achtergrond proces
        callDeepEngine(prompt, previousCode).then(async (finalCode) => {
            // Naam verzinnen op basis van de opdracht
            const nameResponse = await axios.post(ROUTE_LLM_URL, {
                model: "route-llm",
                messages: [{ role: "user", content: `Geef een korte, luxe naam (max 2 woorden) voor deze app: ${prompt}. Geef alleen de naam.` }]
            }, { headers: { "Authorization": `Bearer ${API_KEY}` } });
            
            const newName = nameResponse.data.choices[0].message.content.replace(/"/g, "").trim();
            await supabase.from("projects").update({ code: finalCode, name: newName }).eq("id", id);
        }).catch(async (err) => {
            await supabase.from("projects").update({ code: "FOUT: " + err.message }).eq("id", id);
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Overige routes blijven gelijk...
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
app.listen(PORT, () => console.log(`Kavrix Engine v9.0 Online`));

process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));
