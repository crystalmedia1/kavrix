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

const MODEL = "llama-3.3-70b-versatile";

async function callAI(messages, temperature = 0.2) {
    const response = await axios.post(GROQ_API_URL, {
        model: MODEL,
        messages: messages,
        temperature: temperature,
        max_tokens: 8000
    }, { 
        headers: { "Authorization": `Bearer ${API_KEY}` },
        timeout: 120000 // 2 minuten timeout voor zware taken
    });
    return response.data.choices[0].message.content;
}

function cleanCode(text) {
    if (!text) return "";
    let code = text.replace(/```(?:html|javascript|js)?/gi, "").replace(/```/g, "").trim();
    const start = code.search(/<!DOCTYPE/i);
    if (start !== -1) code = code.substring(start);
    const end = code.lastIndexOf("<​/html>");
    if (end !== -1) code = code.substring(0, end + 7);
    return code;
}

app.post("/generate", async (req, res) => {
    const { prompt, projectId } = req.body;
    console.log("DeepAgent start opdracht: " + prompt);
    
    try {
        let previousCode = "";
        if (projectId) {
            const { data } = await supabase.from("projects").select("code").eq("id", projectId).single();
            previousCode = data ? data.code : "";
        }

        // STAP 1: PLANNING & ARCHITECTUUR
        const plan = await callAI([
            { role: "system", content: "Je bent een Senior Architect. Maak een technisch plan voor deze app. Focus op logica en werkende functies." },
            { role: "user", content: `Opdracht: ${prompt}\nContext: ${previousCode ? "Update bestaande code." : "Nieuwe app."}` }
        ]);

        // STAP 2: PRODUCTIE (DE CODE)
        const codeResponse = await callAI([
            { 
                role: "system", 
                content: `Je bent KAVRIX DEEP-ENGINE. Bouw de app EXACT volgens dit plan: ${plan}. 
                EISEN: Gebruik Tailwind, FontAwesome. Schrijf ALLES in één HTML bestand. 
                Zorg dat alle JS functies ECHT werken. Geef GEEN tekst, alleen code.` 
            },
            { role: "user", content: prompt }
        ], 0.1);

        let finalCode = cleanCode(codeResponse);

        // STAP 3: OPSLAAN IN DATABASE
        let dbResult;
        if (projectId) {
            dbResult = await supabase.from("projects").update({ 
                code: finalCode, 
                prompt: prompt, 
                updated_at: new Date() 
            }).eq("id", projectId).select();
        } else {
            dbResult = await supabase.from("projects").insert([{ 
                name: prompt.substring(0, 30), 
                code: finalCode, 
                prompt: prompt 
            }]).select();
        }

        res.json({ code: finalCode, projectId: dbResult.data[0].id });
    } catch (error) {
        console.error("Fout:", error.message);
        res.status(500).json({ error: "DeepAgent Timeout of Error. Probeer een kortere opdracht." });
    }
});

// Overige standaard routes
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

app.get("/share/:id", async (req, res) => {
    const { data } = await supabase.from("projects").select("code").eq("id", req.params.id).single();
    res.send(data ? data.code : "Niet gevonden");
});

app.listen(process.env.PORT || 3000, () => console.log("Kavrix Engine v3.1 Online"));
