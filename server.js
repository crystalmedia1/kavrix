const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Hulpfunctie voor een korte pauze (om 429 te voorkomen)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

app.post("/generate", async (req, res) => {
    const { prompt, existingCode, projectId } = req.body;
    const API_KEY = process.env.API_KEY;

    try {
        // STAP 1: DE AGENT DENKT NA (Licht model = minder snel 429)
        const agentPlan = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
            model: "llama-3.1-8b-instant", // Lichter model voor planning
            messages: [
                { role: "system", content: "Je bent KAVRIX ARCHITECT. Maak een plan van 3 regels voor deze app." },
                { role: "user", content: prompt }
            ]
        }, { headers: { "Authorization": `Bearer ${API_KEY}` } });

        const plan = agentPlan.data.choices[0].message.content;
        
        // EVEN PAUZEREN (1.5 seconde) om de API rust te geven
        await sleep(1500);

        // STAP 2: DE AGENT VOERT UIT (Zwaar model voor de code)
        const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
            model: "llama-3.3-70b-versatile", 
            messages: [
                { role: "system", content: "Je bent KAVRIX DEEP-ENGINE. Plan: " + plan + ". Bouw volledige HTML/Tailwind code." },
                { role: "user", content: existingCode ? `UPDATE:\n${existingCode}\n\nWIJZIGING: ${prompt}` : prompt }
            ],
            temperature: 0.2
        }, { headers: { "Authorization": `Bearer ${API_KEY}` }, timeout: 60000 });

        let newCode = response.data.choices[0].message.content;
        
        // Opslaan in Supabase
        let dbResult;
        if (projectId) {
            dbResult = await supabase.from("projects").update({ code: newCode, prompt: prompt, updated_at: new Date() }).eq("id", projectId).select();
        } else {
            dbResult = await supabase.from("projects").insert([{ name: prompt.substring(0, 30), code: newCode, prompt: prompt }]).select();
        }

        res.json({ code: newCode, projectId: dbResult.data[0].id, plan: plan });

    } catch (error) {
        const errorMsg = error.response?.data?.error?.message || error.message;
        res.status(500).json({ error: "AGENT FOUT: " + errorMsg });
    }
});

app.get("/project/:id", async (req, res) => {
    const { data, error } = await supabase.from("projects").select("*").eq("id", req.params.id).single();
    if (error) return res.status(404).json({ error: "Niet gevonden" });
    res.json(data);
});

app.listen(process.env.PORT || 3000, () => console.log("Kavrix v9.1 Anti-Limit Engine Online"));
