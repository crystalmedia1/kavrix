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
let PRIMARY_MODEL = "llama-3.3-70b-versatile"; 
let FALLBACK_MODEL = "llama-3.1-8b-instant";

let queue = [];
let isProcessing = false;

async function processQueue() {
    if (isProcessing || queue.length === 0) return;
    isProcessing = true;
    const task = queue.shift();
    try { await smartAIRequest(task.prompt, task.previousCode, task.projectId); } catch (e) {}
    isProcessing = false;
    setTimeout(processQueue, 2000);
}

async function smartAIRequest(prompt, previousCode, projectId, attempt = 1) {
    try {
        const model = attempt > 1 ? FALLBACK_MODEL : PRIMARY_MODEL;
        const architectResponse = await axios.post(AI_API_URL, {
            model: model,
            messages: [
                { role: "system", content: "Je bent de KAVRIX MASTER ARCHITECT. Bouw luxe HTML5 apps met Tailwind CSS. Geef ALLEEN de ruwe HTML code terug." },
                { role: "user", content: `CONTEXT:\n${previousCode}\n\nOPDRACHT: ${prompt}` }
            ]
        }, { headers: { "Authorization": `Bearer ${API_KEY}` }, timeout: 180000 });

        let rawCode = architectResponse.data.choices[0].message.content;
        const reviewerResponse = await axios.post(AI_API_URL, {
            model: FALLBACK_MODEL,
            messages: [
                { role: "system", content: "Schoon de code op. Begin met <!DOCTYPE html>." },
                { role: "user", content: rawCode }
            ]
        }, { headers: { "Authorization": `Bearer ${API_KEY}` }, timeout: 60000 });

        let finalCode = reviewerResponse.data.choices[0].message.content;
        if (finalCode.includes("<​/html>")) finalCode = finalCode.split("<​/html>")[0] + "<​/html>";
        finalCode = finalCode.replace(/```(?:html)?/gi, "").replace(/```/g, "").trim();

        const nameResponse = await axios.post(AI_API_URL, {
            model: FALLBACK_MODEL,
            messages: [{ role: "user", content: `Korte naam (max 10 tekens) voor: ${prompt}` }]
        }, { headers: { "Authorization": `Bearer ${API_KEY}` } }).catch(() => ({ data: { choices: [{ message: { content: "APP" } }] } }));
        
        let newName = nameResponse.data.choices[0].message.content.replace(/[#*"`]/g, "").trim().toUpperCase().substring(0, 10);
        await supabase.from("projects").update({ code: finalCode, name: newName }).eq("id", projectId);
    } catch (error) {
        if (attempt < 3) return smartAIRequest(prompt, previousCode, projectId, attempt + 1);
        await supabase.from("projects").update({ code: "FOUT: AI overbelast. Probeer opnieuw." }).eq("id", projectId);
    }
}

app.post("/generate", async (req, res) => {
    const { prompt, projectId, userId } = req.body;
    try {
        let id = projectId;
        let previousCode = "";
        if (id) {
            const { data } = await supabase.from("projects").select("code").eq("id", id).single();
            previousCode = data ? data.code : "";
        }
        if (!id) {
            const { data, error } = await supabase.from("projects").insert([{ 
                name: "WACHTEN...", 
                code: "GENERATING", 
                prompt: prompt,
                user_id: userId 
            }]).select();
            if (error) throw error;
            id = data[0].id;
        } else {
            await supabase.from("projects").update({ code: "GENERATING", prompt: prompt }).eq("id", id);
        }
        res.json({ projectId: id });
        queue.push({ prompt, previousCode, projectId: id });
        processQueue();
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get("/projects/:userId", async (req, res) => {
    try {
        const { data } = await supabase.from("projects")
            .select("id, name, created_at")
            .eq("user_id", req.params.userId)
            .order("created_at", { ascending: false });
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
app.listen(PORT, () => console.log(`Kavrix Launch Engine v22.0 Online`));
