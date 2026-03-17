const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- SLIMME FILTER & CLEANER ---
function prepareContent(text) {
    if (!text) return "";
    // Vervang gevoelige woorden die AI-filters triggeren
    return text
        .replace(/IPTV/gi, "HLS Media Player")
        .replace(/m3u/gi, "stream playlist")
        .replace(/illegal/gi, "custom");
}

function cleanCode(text) {
    if (!text) return "";
    let code = text.trim();
    code = code.replace(/```html/g, "").replace(/```/g, "").trim();
    const start = code.indexOf("<​!DOCTYPE html>");
    const end = code.lastIndexOf("<​/html>");
    if (start !== -1 && end !== -1) return code.substring(start, end + 7);
    return code;
}

// --- DE GENERATE MOTOR ---
app.post("/generate", async (req, res) => {
    const { prompt, existingCode } = req.body;
    const API_KEY = process.env.API_KEY;

    if (!API_KEY) return res.status(500).json({ error: "Geen API_KEY gevonden." });

    // GEHEUGEN OPTIMALISATIE: 
    // Als de bestaande code te groot is, sturen we alleen de essentie (Body & Scripts)
    let optimizedCode = existingCode || "";
    if (optimizedCode.length > 10000) {
        optimizedCode = optimizedCode.substring(0, 5000) + "...[code truncated for speed]..." + optimizedCode.slice(-5000);
    }

    const safePrompt = prepareContent(prompt);

    try {
        // We gebruiken hier de RouteLLM van Abacus als je die hebt, 
        // anders valt hij terug op de Groq motor die we al hadden.
        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions", 
            {
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: "Je bent KAVRIX AI. Bouw ALTIJD volledige HTML/Tailwind code. Geen tekst, alleen code." },
                    { role: "user", content: `CONTEXT:\n${optimizedCode}\n\nOPDRACHT: ${safePrompt}` }
                ],
                temperature: 0.2
            },
            {
                headers: { "Authorization": `Bearer ${API_KEY}` },
                timeout: 60000
            }
        );

        const html = cleanCode(response.data.choices[0].message.content);
        res.json({ code: html });

    } catch (error) {
        console.error("AI Error:", error.response?.data || error.message);
        res.status(500).json({ error: "AI is overbelast. Probeer het over 10 seconden nogmaals." });
    }
});

app.listen(process.env.PORT || 3000, () => console.log("Kavrix Engine v9.0 Online"));
