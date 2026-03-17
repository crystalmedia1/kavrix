const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

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
    const API_KEY = process.env.API_KEY;

    try {
        // AI aanroepen via Groq
        const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: "Je bent KAVRIX PRO AI. Bouw ALTIJD volledige HTML/Tailwind code. Geen tekst, alleen code." },
                { role: "user", content: existingCode ? `UPDATE DEZE CODE:\n${existingCode}\n\nWIJZIGING: ${prompt}` : `BOUW NIEUWE APP: ${prompt}` }
            ],
            temperature: 0.2
        }, { headers: { "Authorization": `Bearer ${API_KEY}` }, timeout: 60000 });

        const newCode = cleanCode(response.data.choices[0].message.content);

        // Opslaan in Supabase
        let dbResult;
        if (projectId) {
            dbResult = await supabase.from("projects").update({ code: newCode, prompt: prompt, updated_at: new Date() }).eq("id", projectId).select();
        } else {
            dbResult = await supabase.from("projects").insert([{ name: prompt.substring(0, 30), code: newCode, prompt: prompt }]).select();
        }

        res.json({ code: newCode, projectId: dbResult.data[0].id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/project/:id", async (req, res) => {
    const { data, error } = await supabase.from("projects").select("*").eq("id", req.params.id).single();
    if (error) return res.status(404).json({ error: "Niet gevonden" });
    res.json(data);
});

app.listen(process.env.PORT || 3000, () => console.log("Kavrix v9.0 Engine Online"));
