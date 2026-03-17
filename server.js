const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- NIEUW: HAAL ALLE PROJECTEN OP ---
app.get("/projects", async (req, res) => {
    const { data, error } = await supabase
        .from("projects")
        .select("id, name, created_at")
        .order("created_at", { ascending: false });
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// --- DEEP-AGENT CONTEXT ENGINE ---
async function getProjectContext(projectId) {
    if (!projectId) return "";
    const { data, error } = await supabase.from("projects").select("prompt, code").eq("id", projectId).single();
    if (error || !data) return "";
    return `CONTEXT: De huidige app is gebaseerd op: "${data.prompt}". Code:\n${data.code}\n\n`;
}

app.post("/generate", async (req, res) => {
    const { prompt, projectId } = req.body;
    const API_KEY = process.env.API_KEY;

    try {
        const context = await getProjectContext(projectId);
        const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: "Je bent KAVRIX DEEP-AGENT. Bouw ALTIJD volledige HTML/Tailwind code." },
                { role: "user", content: `${context}OPDRACHT: ${prompt}` }
            ],
            temperature: 0.2
        }, { headers: { "Authorization": `Bearer ${API_KEY}` }, timeout: 60000 });

        const finalCode = response.data.choices[0].message.content;
        
        let dbResult;
        if (projectId) {
            dbResult = await supabase.from("projects").update({ code: finalCode, prompt: prompt, updated_at: new Date() }).eq("id", projectId).select();
        } else {
            dbResult = await supabase.from("projects").insert([{ name: prompt.substring(0, 30), code: finalCode, prompt: prompt }]).select();
        }

        res.json({ code: finalCode, projectId: dbResult.data[0].id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/project/:id", async (req, res) => {
    const { data, error } = await supabase.from("projects").select("*").eq("id", req.params.id).single();
    if (error) return res.status(404).json({ error: "Niet gevonden" });
    res.json(data);
});

app.listen(process.env.PORT || 3000, () => console.log("Kavrix DeepAgent Dashboard Engine Online"));
