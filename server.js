const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const API_KEY = process.env.API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

async function callAI(prompt) {
    const response = await axios.post(GROQ_API_URL, {
        model: "llama-3.3-70b-versatile",
        messages: [
            { role: "system", content: "Je bent KAVRIX DEEP-ENGINE. Bouw een complete, werkende single-page HTML app met Tailwind CSS. Geef ALLEEN de code, geen tekst." },
            { role: "user", content: prompt }
        ],
        temperature: 0.2
    }, { headers: { "Authorization": `Bearer ${API_KEY}` } });
    
    let code = response.data.choices[0].message.content;
    return code.replace(/```(?:html)?/gi, "").replace(/```/g, "").trim();
}

app.post("/generate", async (req, res) => {
    const { prompt, projectId } = req.body;
    
    try {
        let id = projectId;
        if (!id) {
            const { data } = await supabase.from("projects").insert([{ 
                name: prompt.substring(0, 30), 
                code: "GENERATING", 
                prompt: prompt 
            }]).select();
            id = data[0].id;
        } else {
            await supabase.from("projects").update({ code: "GENERATING", prompt: prompt }).eq("id", id);
        }

        // STUUR DIRECT ANTWOORD: "Ik ben bezig!"
        res.json({ projectId: id, status: "started" });

        // GA NU OP DE ACHTERGROND VERDER
        callAI(prompt).then(async (finalCode) => {
            await supabase.from("projects").update({ code: finalCode }).eq("id", id);
            console.log("Project " + id + " is klaar!");
        }).catch(async (err) => {
            await supabase.from("projects").update({ code: "ERROR: " + err.message }).eq("id", id);
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/projects", async (req, res) => {
    const { data } = await supabase.from("projects").select("id, name, created_at").order("created_at", { ascending: false });
    res.json(data || []);
});

app.get("/project/:id", async (req, res) => {
    const { data } = await supabase.from("projects").select("*").eq("id", req.params.id).single();
    res.json(data);
});

app.delete("/delete-project/:id", async (req, res) => {
    await supabase.from("projects").delete().eq("id", req.params.id);
    res.json({ success: true });
});

app.listen(process.env.PORT || 3000, () => console.log("Kavrix Async Engine Online"));
