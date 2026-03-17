const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- AGENT CONTEXT ENGINE ---
async function getProjectContext(projectId) {
    if (!projectId) return "";
    const { data, error } = await supabase
        .from("projects")
        .select("prompt, code")
        .eq("id", projectId)
        .single();
    
    if (error || !data) return "";
    return `EERDERE STAP: De gebruiker vroeg om: "${data.prompt}". De huidige code is: \n${data.code}\n\n`;
}

async function callDeepAgent(prompt, projectId, apiKey) {
    const context = await getProjectContext(projectId);
    const model = "llama-3.3-70b-versatile";

    try {
        const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
            model: model,
            messages: [
                { 
                    role: "system", 
                    content: "Je bent KAVRIX DEEP-AGENT. Je hebt toegang tot de volledige projectgeschiedenis. Bouw ALTIJD volledige HTML/Tailwind code. Geen tekst, alleen code." 
                },
                { 
                    role: "user", 
                    content: `${context}NIEUWE OPDRACHT: ${prompt}\n\nPas de code aan op basis van de geschiedenis en de nieuwe opdracht.` 
                }
            ],
            temperature: 0.2
        }, { headers: { "Authorization": `Bearer ${apiKey}` }, timeout: 60000 });

        return response.data.choices[0].message.content;
    } catch (error) {
        // Fallback naar lichter model bij 429
        if (error.response && error.response.status === 429) {
            const fallbackResponse = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
                model: "llama-3.1-8b-instant",
                messages: [
                    { role: "system", content: "Je bent KAVRIX DEEP-AGENT. Bouw volledige HTML/Tailwind code." },
                    { role: "user", content: `${context}NIEUWE OPDRACHT: ${prompt}` }
                ]
            }, { headers: { "Authorization": `Bearer ${apiKey}` } });
            return fallbackResponse.data.choices[0].message.content;
        }
        throw error;
    }
}

app.post("/generate", async (req, res) => {
    const { prompt, projectId } = req.body;
    const API_KEY = process.env.API_KEY;

    try {
        const finalCode = await callDeepAgent(prompt, projectId, API_KEY);
        
        let dbResult;
        if (projectId) {
            dbResult = await supabase.from("projects").update({ 
                code: finalCode, 
                prompt: prompt, 
                updated_at: new Date() 
            }).eq("id", projectId).select();
        } else {
            dbResult = await supabase.from("projects").insert([{ 
                name: prompt.substring(0, 30), 
                code: finalCode, 
                prompt: prompt 
            }]).select();
        }

        res.json({ code: finalCode, projectId: dbResult.data[0].id });
    } catch (error) {
        res.status(500).json({ error: "DEEP-AGENT CONTEXT ERROR: " + error.message });
    }
});

app.get("/project/:id", async (req, res) => {
    const { data, error } = await supabase.from("projects").select("*").eq("id", req.params.id).single();
    if (error) return res.status(404).json({ error: "Niet gevonden" });
    res.json(data);
});

app.listen(process.env.PORT || 3000, () => console.log("Kavrix DeepAgent Context Engine Online"));
