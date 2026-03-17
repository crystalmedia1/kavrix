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
    // Automatische detectie van de provider op basis van de key
    let apiUrl = "https://api.groq.com/openai/v1/chat/completions";
    let model = "llama-3.3-70b-versatile";

    if (API_KEY && !API_KEY.startsWith("gsk_")) {
        // Als de key niet met gsk_ begint, gaan we ervan uit dat het Abacus/RouteLLM is
        apiUrl = "https://routellm.abacus.ai/v1/chat/completions";
        model = "route-llm";
    }

    try {
        const response = await axios.post(apiUrl, {
            model: model,
            messages: [
                { 
                    role: "system", 
                    content: `Je bent KAVRIX DEEP-ENGINE v11.0. Bouw luxe, moderne web-apps.
                    STIJL: Donker thema, Glassmorphism, Tailwind CSS, Lucide Icons.
                    Geef ALLEEN de volledige HTML code terug.` 
                },
                { role: "user", content: `CONTEXT:\n${previousCode}\n\nOPDRACHT: ${prompt}` }
            ],
            temperature: 0.2
        }, { 
            headers: { "Authorization": `Bearer ${API_KEY}` },
            timeout: 120000 
        });
        
        let code = response.data.choices[0].message.content;
        return code.replace(/```(?:html)?/gi, "").replace(/```/g, "").trim();
    } catch (error) {
        console.error("AI Error Details:", error.response ? error.response.data : error.message);
        throw new Error("AI Verbinding mislukt. Controleer of je API_KEY in Render correct is.");
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

        callDeepEngine(prompt, previousCode).then(async (finalCode) => {
            await supabase.from("projects").update({ code: finalCode }).eq("id", id);
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
app.listen(PORT, () => console.log(`Kavrix Engine v11.0 Online`));
