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

let AI_API_URL = "https://api.groq.com/openai/v1/chat/completions";
let AI_MODEL = "llama-3.3-70b-versatile"; 

if (API_KEY && !API_KEY.startsWith("gsk_")) {
    AI_API_URL = "https://routellm.abacus.ai/v1/chat/completions";
    AI_MODEL = "route-llm";
}

// --- WACHTRIJ SYSTEEM ---
let queue = [];
let isProcessing = false;

async function processQueue() {
    if (isProcessing || queue.length === 0) return;
    isProcessing = true;
    
    const task = queue.shift();
    try {
        await processAIRequest(task.prompt, task.previousCode, task.projectId);
    } catch (e) {
        console.error("Queue Error:", e.message);
    }
    
    isProcessing = false;
    // Wacht 2 seconden tussen taken om de AI ademruimte te geven
    setTimeout(processQueue, 2000);
}

// --- ULTIMATE ENGINE LOGICA v18.0 ---
async function processAIRequest(prompt, previousCode, projectId) {
    try {
        // STAP 1: ARCHITECT
        const architectResponse = await axios.post(AI_API_URL, {
            model: AI_MODEL,
            messages: [
                { role: "system", content: "Je bent de KAVRIX ARCHITECT. Bouw luxe HTML5 apps met Tailwind CSS. Geef ALLEEN de ruwe HTML code terug." },
                { role: "user", content: `CONTEXT:\n${previousCode}\n\nOPDRACHT: ${prompt}` }
            ]
        }, { headers: { "Authorization": `Bearer ${API_KEY}` }, timeout: 180000 });

        let rawCode = architectResponse.data.choices[0].message.content;

        // STAP 2: REVIEWER
        const reviewerResponse = await axios.post(AI_API_URL, {
            model: "llama-3.1-8b-instant",
            messages: [
                { role: "system", content: "Je bent de KAVRIX REVIEWER. Verwijder alle tekst die geen code is. Begin met <!DOCTYPE html>." },
                { role: "user", content: rawCode }
            ]
        }, { headers: { "Authorization": `Bearer ${API_KEY}` }, timeout: 90000 });

        let finalCode = reviewerResponse.data.choices[0].message.content;
        if (finalCode.includes("<​/html>")) finalCode = finalCode.split("<​/html>")[0] + "<​/html>";
        finalCode = finalCode.replace(/```(?:html)?/gi, "").replace(/```/g, "").trim();

        // STAP 3: NAAM
        const nameResponse = await axios.post(AI_API_URL, {
            model: "llama-3.1-8b-instant",
            messages: [{ role: "user", content: `Korte naam (max 12 tekens) voor: ${prompt}` }]
        }, { headers: { "Authorization": `Bearer ${API_KEY}` } }).catch(() => ({ data: { choices: [{ message: { content: "PROJECT" } }] } }));
        
        let newName = nameResponse.data.choices[0].message.content.replace(/[#*"`]/g, "").trim().toUpperCase().substring(0, 12);

        await supabase.from("projects").update({ code: finalCode, name: newName }).eq("id", projectId);

    } catch (error) {
        console.error("AI Fout:", error.message);
        await supabase.from("projects").update({ code: "FOUT: De AI is overbelast. Ik probeer het zo nog een keer..." }).eq("id", projectId);
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
            const { data, error } = await supabase.from("projects").insert([{ name: "IN WACHTRIJ...", code: "GENERATING", prompt: prompt }]).select();
            if (error) throw error;
            id = data[0].id;
        } else {
            await supabase.from("projects").update({ code: "GENERATING", prompt: prompt }).eq("id", id);
        }

        res.json({ projectId: id });
        
        // Voeg toe aan de wachtrij in plaats van direct uitvoeren
        queue.push({ prompt, previousCode, projectId: id });
        processQueue();

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
app.listen(PORT, () => console.log(`Kavrix Queue Engine v18.0 Online`));
