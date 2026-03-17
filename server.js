const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function callAI(prompt, existingCode, provider = "groq") {
    const apiKey = provider === "groq" ? process.env.API_KEY : process.env.BACKUP_API_KEY;
    const url = provider === "groq" 
        ? "https://api.groq.com/openai/v1/chat/completions" 
        : "https://api.openai.com/v1/chat/completions";
    const model = provider === "groq" ? "llama-3.3-70b-versatile" : "gpt-4o-mini";

    return await axios.post(url, {
        model: model,
        messages: [
            { role: "system", content: "Je bent KAVRIX DEEP-ENGINE. Bouw volledige HTML/Tailwind code." },
            { role: "user", content: existingCode ? `UPDATE:\n${existingCode}\n\nWIJZIGING: ${prompt}` : prompt }
        ],
        temperature: 0.2
    }, { headers: { "Authorization": `Bearer ${apiKey}` }, timeout: 60000 });
}

app.post("/generate", async (req, res) => {
    const { prompt, existingCode, projectId } = req.body;

    try {
        let response;
        try {
            // Probeer eerst Groq (Gratis/Goedkoop)
            response = await callAI(prompt, existingCode, "groq");
        } catch (e) {
            if (e.response && (e.response.status === 429 || e.response.status === 400)) {
                console.log("Groq limiet bereikt, overschakelen naar Backup...");
                // Schakel over naar Backup (OpenAI)
                response = await callAI(prompt, existingCode, "backup");
            } else {
                throw e;
            }
        }

        const newCode = response.data.choices[0].message.content;
        
        // Opslaan in Supabase
        let dbResult;
        if (projectId) {
            dbResult = await supabase.from("projects").update({ code: newCode, prompt: prompt, updated_at: new Date() }).eq("id", projectId).select();
        } else {
            dbResult = await supabase.from("projects").insert([{ name: prompt.substring(0, 30), code: newCode, prompt: prompt }]).select();
        }

        res.json({ code: newCode, projectId: dbResult.data[0].id });

    } catch (error) {
        res.status(500).json({ error: "SYSTEM FAILURE: " + error.message });
    }
});

app.get("/project/:id", async (req, res) => {
    const { data, error } = await supabase.from("projects").select("*").eq("id", req.params.id).single();
    if (error) return res.status(404).json({ error: "Niet gevonden" });
    res.json(data);
});

app.listen(process.env.PORT || 3000, () => console.log("Kavrix Multi-Engine Router Online"));
