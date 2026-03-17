const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Helper to clean AI response
function cleanCode(text) {
  if (!text) return "";
  let code = text.trim();
  code = code.replace(/```html/g, "").replace(/```/g, "").trim();
  const start = code.indexOf("<​!DOCTYPE html>");
  const end = code.lastIndexOf("<​/html>");
  if (start !== -1 && end !== -1) return code.substring(start, end + 7);
  return code;
}

// Simple heuristic to decide if prompt is "big" or "small"
function isBigTask(prompt) {
  const bigKeywords = ["nieuw", "bouw", "maak", "complex", "dashboard", "app", "volledig", "uitgebreid"];
  const lower = prompt.toLowerCase();
  return bigKeywords.some(word => lower.includes(word));
}

// Call Groq API
async function callGroqAPI(prompt, existingCode, apiKey) {
  const messages = [
    { role: "system", content: "Je bent KAVRIX PRO AI. Bouw ALTIJD volledige HTML/Tailwind code. Geen tekst, alleen code." },
    { role: "user", content: existingCode ? `UPDATE:\n${existingCode}\n\nWIJZIGING: ${prompt}` : `BOUW: ${prompt}` }
  ];

  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.2
    },
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 60000
    }
  );
  return response.data.choices[0].message.content;
}

// Placeholder for future high-end API call
async function callHighEndAPI(prompt, existingCode, apiKey) {
  // Later vullen met Anthropic/OpenAI etc.
  throw new Error("High-end API nog niet geconfigureerd");
}

app.post("/generate", async (req, res) => {
  const { prompt, existingCode, projectId } = req.body;
  const groqKey = process.env.API_KEY; // Groq key
  const highEndKey = process.env.HIGHEND_API_KEY; // High-end key (later)

  if (!groqKey) return res.status(500).json({ error: "Geen Groq API_KEY gevonden in environment." });

  try {
    let aiResponse;
    if (isBigTask(prompt) && highEndKey) {
      // Grote taak: stuur naar high-end model
      try {
        aiResponse = await callHighEndAPI(prompt, existingCode, highEndKey);
      } catch (e) {
        console.log("High-end API faalde, fallback naar Groq:", e.message);
        aiResponse = await callGroqAPI(prompt, existingCode, groqKey);
      }
    } else {
      // Kleine taak: stuur naar Groq
      aiResponse = await callGroqAPI(prompt, existingCode, groqKey);
    }

    const cleanedCode = cleanCode(aiResponse);

    // Opslaan in Supabase
    let dbResult;
    if (projectId) {
      dbResult = await supabase.from("projects").update({
        code: cleanedCode,
        prompt,
        updated_at: new Date()
      }).eq("id", projectId).select();
    } else {
      dbResult = await supabase.from("projects").insert([{
        name: prompt.substring(0, 20),
        code: cleanedCode,
        prompt
      }]).select();
    }

    if (dbResult.error) throw new Error(dbResult.error.message);

    res.json({ code: cleanedCode, projectId: dbResult.data[0].id });

  } catch (error) {
    console.error("Fout in generate:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get("/project/:id", async (req, res) => {
  const { data, error } = await supabase.from("projects").select("*").eq("id", req.params.id).single();
  if (error) return res.status(404).json({ error: "Project niet gevonden." });
  res.json(data);
});

app.listen(process.env.PORT || 3000, () => console.log("Kavrix Router Engine v1.0 gestart"));
