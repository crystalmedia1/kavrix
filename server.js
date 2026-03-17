const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- JOUW SUPABASE DATABASE ---
const supabase = createClient(
    process.env.SUPABASE_URL || "https://qixbvlixyanoswsbucav.supabase.co",
    process.env.SUPABASE_KEY || "sb_publishable_wkhKyrhGyEN-ma8-DV61hw_Q47c98lB"
);

function cleanCode(text) {
    if (!text) return "";
    let code = text.trim();
    code = code.replace(/```html/g, "").replace(/```/g, "").trim();
    const start = code.indexOf("<​!DOCTYPE html>");
    const end = code.lastIndexOf("<​/html>");
    if (start !== -1 && end !== -1) return code.substring(start, end + 7);
    return code;
}

app.post("/generate", async (req, res) => {
    const { prompt, existingCode, projectId } = req.body;
    // We gebruiken de API_KEY die je al in Render had staan (de gsk_... sleutel)
    const API_KEY = process.env.API_KEY || process.env.ROUTELLM_KEY;

    if (!API_KEY) return res.status(500).json({ error: "FOUT: Geen API_KEY gevonden in Render." });

    try {
        // 1. AI aanroepen via de JUISTE Groq URL
        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions", 
            {
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: "Je bent KAVRIX PRO AI. Bouw ALTIJD volledige HTML/Tailwind code. Geen tekst, alleen code." },
                    { role: "user", content: existingCode ? `UPDATE DEZE CODE:\n${existingCode}\n\nWIJZIGING: ${prompt}` : `BOUW NIEUWE APP: ${prompt}` }
                ],
                temperature: 0.2
            },
            { headers: { "Authorization": `Bearer ${API_KEY}` }, timeout: 60000 }
        );

        const newCode = cleanCode(response.data.choices[0].message.content);

        // 2. Opslaan in je Supabase Database
        let dbResult;
        if (projectId) {
            dbResult = await supabase.from("projects").update({ 
                code: newCode, 
                prompt: prompt,
                updated_at: new Date() 
            }).eq("id", projectId).select();
        } else {
            dbResult = await supabase.from("projects").insert([{ 
                name: prompt.substring(0, 20), 
                code: newCode, 
                prompt: prompt 
            }]).select();
        }

        if (dbResult.error) throw new Error("Database fout: " + dbResult.error.message);

        res.json({ code: newCode, projectId: dbResult.data[0].id });

    } catch (error) {
        const msg = error.response?.data?.error?.message || error.message;
        res.status(500).json({ error: "FOUT: " + msg });
    }
});

app.get("/project/:id", async (req, res) => {
    const { data, error } = await supabase.from("projects").select("*").eq("id", req.params.id).single();
    if (error) return res.status(404).json({ error: "Project niet gevonden." });
    res.json(data);
});

app.listen(process.env.PORT || 3000, () => console.log("Kavrix Groq Engine Online"));
