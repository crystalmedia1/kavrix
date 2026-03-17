const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- DE AGENTIC ENGINE ---
app.post("/generate", async (req, res) => {
    const { prompt, existingCode, projectId } = req.body;
    const API_KEY = process.env.API_KEY;

    try {
        // STAP 1: DE AGENT DENKT NA (PLANNING)
        // We dwingen de AI om eerst een plan te maken
        const agentPlan = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: "Je bent de KAVRIX AGENT CORE. Maak een kort technisch plan voor de aanvraag van de gebruiker. Focus op architectuur." },
                { role: "user", content: prompt }
            ]
        }, { headers: { "Authorization": `Bearer ${API_KEY}` } });

        const plan = agentPlan.data.choices[0].message.content;
        console.log("Agent Plan:", plan);

        // STAP 2: DE AGENT VOERT UIT (CODEREN)
        const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: "Je bent KAVRIX DEEP-ENGINE. Gebruik dit plan: " + plan + ". Bouw de volledige HTML/Tailwind code." },
                { role: "user", content: existingCode ? `Huidige code:\n${existingCode}\n\nNieuwe instructie: ${prompt}` : prompt }
            ],
            temperature: 0.1 // Lager is nauwkeuriger, zoals DeepAgent
        }, { headers: { "Authorization": `Bearer ${API_KEY}` }, timeout: 60000 });

        let newCode = response.data.choices[0].message.content;
        
        // STAP 3: OPSLAAN IN HET AGENT-GEHEUGEN (SUPABASE)
        let dbResult;
        if (projectId) {
            dbResult = await supabase.from("projects").update({ 
                code: newCode, 
                prompt: prompt, 
                updated_at: new Date() 
            }).eq("id", projectId).select();
        } else {
            dbResult = await supabase.from("projects").insert([{ 
                name: prompt.substring(0, 30), 
                code: newCode, 
                prompt: prompt 
            }]).select();
        }

        res.json({ 
            code: newCode, 
            projectId: dbResult.data[0].id,
            plan: plan // We sturen het plan mee naar de frontend voor de "DeepAgent vibe"
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ... rest van de code (project ophalen etc.) blijft hetzelfde ...
app.listen(process.env.PORT || 3000, () => console.log("Kavrix DeepAgent Engine Online"));
