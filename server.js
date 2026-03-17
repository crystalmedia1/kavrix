const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- SUPABASE CONNECTIE ---
const supabase = createClient(
    process.env.SUPABASE_URL || "https://qixbvlixyanoswsbucav.supabase.co",
    process.env.SUPABASE_KEY || "sb_publishable_wkhKyrhGyEN-ma8-DV61hw_Q47c98lB"
);

// --- HULPFUNCTIES ---
function cleanCode(text) {
    if (!text) return "";
    let code = text.trim();
    code = code.replace(/```html/g, "").replace(/```/g, "").trim();
    const start = code.indexOf("<​!DOCTYPE html>");
    const end = code.lastIndexOf("<​/html>");
    if (start !== -1 && end !== -1) return code.substring(start, end + 7);
    return code;
}

// --- AI GENERATE & OPSLAAN ---
app.post("/generate", async (req, res) => {
    const { prompt, existingCode, projectId } = req.body;
    const API_KEY = process.env.ROUTELLM_KEY || process.env.API_KEY;

    if (!API_KEY) return res.status(500).json({ error: "Geen API_KEY gevonden." });

    try {
        // 1. AI aanroepen (RouteLLM voor topkwaliteit)
        const response = await axios.post(
            "https://routellm.abacus.ai/v1/chat/completions", 
            {
                model: "route-llm",
                messages: [
                    { role: "system", content: "Je bent KAVRIX PRO AI. Bouw ALTIJD volledige HTML/Tailwind code. Geen tekst, alleen code." },
                    { role: "user", content: existingCode ? `UPDATE DEZE CODE:\n${existingCode}\n\nWIJZIGING: ${prompt}` : `BOUW NIEUWE APP: ${prompt}` }
                ],
                temperature: 0.2
            },
            {
                headers: { "Authorization": `Bearer ${API_KEY}` },
                timeout: 60000
            }
        );

        const newCode = cleanCode(response.data.choices[0].message.content);

        // 2. Opslaan in Supabase Database
        let dbResult;
        if (projectId) {
            // Update bestaand project
            dbResult = await supabase.from("projects").update({ 
                code: newCode, 
                prompt: prompt,
                updated_at: new Date() 
            }).eq("id", projectId).select();
        } else {
            // Nieuw project aanmaken
            dbResult = await supabase.from("projects").insert([{ 
                name: prompt.substring(0, 20), 
                code: newCode, 
                prompt: prompt 
            }]).select();
        }

        res.json({ 
            code: newCode, 
            projectId: dbResult.data[0].id 
        });

    } catch (error) {
        console.error("Fout:", error.message);
        res.status(500).json({ error: "AI of Database fout. Probeer het opnieuw." });
    }
});

// --- PROJECT OPHALEN ---
app.get("/project/:id", async (req, res) => {
    const { data, error } = await supabase.from("projects").select("*").eq("id", req.params.id).single();
    if (error) return res.status(404).json({ error: "Niet gevonden" });
    res.json(data);
});

app.listen(process.env.PORT || 3000, () => console.log("Kavrix Database Engine Online"));
