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

// Krachtige modellen voor verschillende taken
const PLANNER_MODEL = "llama-3.3-70b-versatile"; 
const CODER_MODEL = "llama-3.3-70b-versatile";

async function callAI(messages, model = CODER_MODEL, temperature = 0.2) {
    const response = await axios.post(GROQ_API_URL, {
        model: model,
        messages: messages,
        temperature: temperature,
        max_tokens: 8000
    }, { headers: { "Authorization": `Bearer ${API_KEY}` } });
    return response.data.choices[0].message.content;
}

function cleanCode(text) {
    let code = text.replace(/```(?:html|javascript|js)?/gi, "").replace(/```/g, "").trim();
    const start = code.search(/<!DOCTYPE/i);
    if (start !== -1) code = code.substring(start);
    return code;
}

// --- DEEP AGENT WORKFLOW ---
async function deepAgentWorkflow(userPrompt, previousCode = "") {
    console.log("Stap 1: Planning...");
    const plan = await callAI([
        { role: "system", content: "Je bent een Senior Software Architect. Maak een technisch plan voor de gevraagde app. Focus op data-structuur, UI componenten en logica. Wees extreem specifiek." },
        { role: "user", content: `Opdracht: ${userPrompt}\nContext: ${previousCode ? "Dit is een update van een bestaande app." : "Dit is een nieuwe app."}` }
    ], PLANNER_MODEL);

    console.log("Stap 2: Coderen...");
    const codeResponse = await callAI([
        { 
            role: "system", 
            content: `Je bent KAVRIX DEEP-ENGINE. Bouw de app EXACT volgens dit plan: ${plan}. 
            EISEN: 
            - Gebruik Tailwind CSS, FontAwesome, Chart.js.
            - Schrijf ALLES in één HTML bestand.
            - Zorg dat alle functies (knoppen, filters, data) ECHT werken met JavaScript.
            - Gebruik Unsplash voor realistische media.
            - Geef GEEN tekst, alleen de code.` 
        },
        { role: "user", content: userPrompt }
    ], CODER_MODEL, 0.1);

    let finalCode = cleanCode(codeResponse);

    console.log("Stap 3: Self-Correction...");
    const correction = await callAI([
        { role: "system", content: "Je bent een QA Tester. Controleer de code op syntax fouten, ontbrekende sluit-tags of kapotte links. Geef alleen de verbeterde code terug als er fouten zijn, anders de originele code." },
        { role: "user", content: finalCode }
    ], CODER_MODEL, 0.1);

    return cleanCode(correction);
}

app.post("/generate", async (req, res) => {
    const { prompt, projectId } = req.body;
    try {
        let previousCode = "";
        if (projectId) {
            const { data } = await supabase.from("projects").select("code").eq("id", projectId).single();
            previousCode = data ? data.code : "";
        }

        const finalCode = await deepAgentWorkflow(prompt, previousCode);
        
        let dbResult;
        if (projectId) {
            dbResult = await supabase.from("projects").update({ code: finalCode, prompt: prompt, updated_at: new Date() }).eq("id", projectId).select();
        } else {
            dbResult = await supabase.from("projects").insert([{ name: prompt.substring(0, 30), code: finalCode, prompt: prompt }]).select();
        }
        res.json({ code: finalCode, projectId: dbResult.data[0].id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "DeepAgent Error: " + error.message });
    }
});

// Andere endpoints (projects, delete, proxy, share) blijven hetzelfde...
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

app.listen(process.env.PORT || 3000, () => console.log("Kavrix Deep-Reasoning Engine Online"));
