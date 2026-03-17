const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- SELF-CORRECTION LINTER ---
function validateCode(code) {
    if (!code) return { valid: false, error: "Geen code gegenereerd." };
    const hasHtml = code.includes("<​html") || code.includes("<!DOCTYPE");
    const hasClosingHtml = code.includes("</html>");
    const hasTailwind = code.includes("tailwindcss");
    
    if (!hasHtml || !hasClosingHtml) return { valid: false, error: "HTML structuur is incompleet (mis <html> of </html>)." };
    return { valid: true };
}

async function callAIWithCorrection(prompt, existingCode, apiKey, attempt = 1) {
    const model = attempt === 1 ? "llama-3.3-70b-versatile" : "llama-3.1-8b-instant";
    
    try {
        const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
            model: model,
            messages: [
                { role: "system", content: "Je bent KAVRIX DEEP-ENGINE. Bouw ALTIJD volledige, werkende HTML/Tailwind code. Geen tekst, alleen code." },
                { role: "user", content: existingCode ? `UPDATE:\n${existingCode}\n\nWIJZIGING: ${prompt}` : prompt }
            ],
            temperature: 0.2
        }, { headers: { "Authorization": `Bearer ${apiKey}` }, timeout: 60000 });

        let aiCode = response.data.choices[0].message.content;
        
        // ZELF-CORRECTIE CHECK
        const check = validateCode(aiCode);
        if (!check.valid && attempt < 3) {
            console.log(`Fout gedetecteerd: ${check.error}. Agent start zelf-correctie (poging ${attempt + 1})...`);
            return await callAIWithCorrection(`FIX DEZE FOUT: ${check.error}\n\nCODE:\n${aiCode}`, null, apiKey, attempt + 1);
        }

        return aiCode;
    } catch (error) {
        if (error.response && error.response.status === 429 && attempt < 3) {
            return await callAIWithCorrection(prompt, existingCode, apiKey, attempt + 1);
        }
        throw error;
    }
}

app.post("/generate", async (req, res) => {
    const { prompt, existingCode, projectId } = req.body;
    const API_KEY = process.env.API_KEY;

    try {
        const finalCode = await callAIWithCorrection(prompt, existingCode, API_KEY);
        
        let dbResult;
        if (projectId) {
            dbResult = await supabase.from("projects").update({ code: finalCode, prompt: prompt, updated_at: new Date() }).eq("id", projectId).select();
        } else {
            dbResult = await supabase.from("projects").insert([{ name: prompt.substring(0, 30), code: finalCode, prompt: prompt }]).select();
        }

        res.json({ code: finalCode, projectId: dbResult.data[0].id });
    } catch (error) {
        res.status(500).json({ error: "AGENT CRITICAL ERROR: " + error.message });
    }
});

app.get("/project/:id", async (req, res) => {
    const { data, error } = await supabase.from("projects").select("*").eq("id", req.params.id).single();
    if (error) return res.status(404).json({ error: "Niet gevonden" });
    res.json(data);
});

app.listen(process.env.PORT || 3000, () => console.log("Kavrix Self-Correction Engine Online"));
