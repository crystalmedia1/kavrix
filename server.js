const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const API_KEY = process.env.API_KEY;
const MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

function cleanCode(text) {
    if (!text) return "";
    let code = text.replace(/```(?:html|javascript|js)?/gi, "").replace(/```/g, "").trim();
    const firstTag = code.search(/<(!doctype|html|head|body|div)/i);
    if (firstTag !== -1) code = code.substring(firstTag);
    const endIdx = code.lastIndexOf("<​/html>");
    if (endIdx !== -1) code = code.substring(0, endIdx + 7);
    return code;
}

async function callDeepAgent(prompt, context, attempt = 0) {
    const model = attempt === 0 ? MODELS[0] : MODELS[1];
    try {
        const response = await axios.post(GROQ_API_URL, {
            model: model,
            messages: [
                { 
                    role: "system", 
                    content: `Je bent KAVRIX DEEP-ENGINE. Je bouwt complexe Multi-Page SPA's.
                    RICHTLIJNEN:
                    1. Gebruik Tailwind CSS en FontAwesome.
                    2. Bouw een Single Page Application (SPA) met een 'view' systeem (show/hide secties).
                    3. Implementeer een navigatiebalk die schakelt tussen views (bijv. Home, Dashboard, Settings).
                    4. Gebruik voor afbeeldingen Unsplash (https://images.unsplash.com/photo-...).
                    5. Gebruik moderne JavaScript (ES6+) voor state management.
                    6. Geef NOOIT uitleg, alleen de volledige HTML code beginnend met <!DOCTYPE html>.`
                },
                { role: "user", content: `${context}\n\nOPDRACHT: ${prompt}` }
            ],
            temperature: 0.2
        }, { headers: { "Authorization": `Bearer ${API_KEY}` }, timeout: 60000 });

        return cleanCode(response.data.choices[0].message.content);
    } catch (error) {
        if (error.response && error.response.status === 429 && attempt === 0) {
            return await callDeepAgent(prompt, context, 1);
        }
        throw error;
    }
}

app.get("/projects", async (req, res) => {
    const { data } = await supabase.from("projects").select("id, name, created_at").order("created_at", { ascending: false });
    res.json(data || []);
});

app.get("/project/:id", async (req, res) => {
    const { data } = await supabase.from("projects").select("*").eq("id", req.params.id).single();
    res.json(data);
});

app.post("/generate", async (req, res) => {
    const { prompt, projectId } = req.body;
    try {
        let context = "";
        if (projectId) {
            const { data } = await supabase.from("projects").select("code, prompt").eq("id", projectId).single();
            if (data) context = `CONTEXT: Vorige code:\n${data.code.slice(-3000)}\nVorige vraag: ${data.prompt}`;
        }

        const finalCode = await callDeepAgent(prompt, context);
        
        let dbResult;
        if (projectId) {
            dbResult = await supabase.from("projects").update({ code: finalCode, prompt: prompt, updated_at: new Date() }).eq("id", projectId).select();
        } else {
            dbResult = await supabase.from("projects").insert([{ name: prompt.substring(0, 30), code: finalCode, prompt: prompt }]).select();
        }

        res.json({ code: finalCode, projectId: dbResult.data[0].id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(process.env.PORT || 3000, () => console.log("Kavrix Multi-Page Engine Online"));
