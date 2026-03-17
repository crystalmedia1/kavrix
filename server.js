const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Functie om AI aan te roepen met automatische model-switch bij limiet
async function callAIWithFallback(prompt, existingCode, apiKey) {
    const models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"];
    let lastError;

    for (const model of models) {
        try {
            console.log(`Proberen met model: ${model}...`);
            const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
                model: model,
                messages: [
                    { role: "system", content: "Je bent KAVRIX DEEP-ENGINE. Bouw ALTIJD volledige HTML/Tailwind code. Geen tekst, alleen code." },
                    { role: "user", content: existingCode ? `UPDATE:\n${existingCode}\n\nWIJZIGING: ${prompt}` : prompt }
                ],
                temperature: 0.2
            }, { headers: { "Authorization": `Bearer ${apiKey}` }, timeout: 60000 });

            return response.data.choices[0].message.content;
        } catch (error) {
            lastError = error;
            if (error.response && error.response.status === 429) {
                console.log(`Limiet bereikt voor ${model}, probeer volgende model...`);
                continue; // Probeer het volgende (lichtere) model in de lijst
            }
            throw error; // Andere fout? Stop dan.
        }
    }
    throw lastError;
}

app.post("/generate", async (req, res) => {
    const { prompt, existingCode, projectId } = req.body;
    const API_KEY = process.env.API_KEY;

    try {
        const aiResponse = await callAIWithFallback(prompt, existingCode, API_KEY);
        
        // Opslaan in Supabase
        let dbResult;
        if (projectId) {
            dbResult = await supabase.from("projects").update({ 
                code: aiResponse, 
                prompt: prompt, 
                updated_at: new Date() 
            }).eq("id", projectId).select();
        } else {
            dbResult = await supabase.from("projects").insert([{ 
                name: prompt.substring(0, 30), 
                code: aiResponse, 
                prompt: prompt 
            }]).select();
        }

        res.json({ code: aiResponse, projectId: dbResult.data[0].id });

    } catch (error) {
        const msg = error.response?.data?.error?.message || error.message;
        res.status(500).json({ error: "KAVRIX ENGINE FOUT: " + msg });
    }
});

app.get("/project/:id", async (req, res) => {
    const { data, error } = await supabase.from("projects").select("*").eq("id", req.params.id).single();
    if (error) return res.status(404).json({ error: "Niet gevonden" });
    res.json(data);
});

app.listen(process.env.PORT || 3000, () => console.log("Kavrix Smart-Efficiency Engine Online"));
