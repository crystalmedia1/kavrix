const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Supabase configuratie met foutcontrole
const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_KEY || "");

const API_KEY = process.env.API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Proxy route voor live data
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
        const response = await axios.post(GROQ_API_URL, {
            model: "llama-3.3-70b-versatile",
            messages: [
                { 
                    role: "system", 
                    content: `Je bent KAVRIX DEEP-ENGINE v8.0. Bouw uitsluitend LUXE web-apps.
                    EISEN: Gebruik Tailwind CSS, Lucide Icons, Chart.js. 
                    STIJL: Donker thema (bg-slate-950), Glassmorphism, afgeronde hoeken (32px).
                    Geef ALLEEN de volledige HTML code terug.` 
                },
                { role: "user", content: `CONTEXT:\n${previousCode}\n\nOPDRACHT: ${prompt}` }
            ],
            temperature: 0.1
        }, { 
            headers: { "Authorization": `Bearer ${API_KEY}` },
            timeout: 60000 // 1 minuut wachten op AI
        });
        
        let code = response.data.choices[0].message.content;
        return code.replace(/```(?:html)?/gi, "").replace(/```/g, "").trim();
    } catch (error) {
        console.error("AI Error:", error.message);
        throw new Error("AI Engine is tijdelijk overbelast. Probeer het over 10 seconden opnieuw.");
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
            const { data, error } = await supabase.from("projects").insert([{ name: "Nieuw Project...", code: "GENERATING", prompt: prompt }]).select();
            if (error) throw error;
            id = data[0].id;
        } else {
            await supabase.from("projects").update({ code: "GENERATING", prompt: prompt }).eq("id", id);
        }

        res.json({ projectId: id });

        // Achtergrond proces met extra veiligheid
        callDeepEngine(prompt, previousCode).then(async (finalCode) => {
            await supabase.from("projects").update({ code: finalCode }).eq("id", id);
        }).catch(async (err) => {
            console.error("Background Error:", err.message);
            await supabase.from("projects").update({ code: "FOUT: " + err.message }).eq("id", id);
        });

    } catch (error) {
        console.error("Server Error:", error.message);
        res.status(500).json({ error: "Server Fout: " + error.message });
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

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Kavrix Engine v8.0 draait op poort ${PORT}`);
});

// Voorkom dat de server crasht bij onverwachte fouten
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
