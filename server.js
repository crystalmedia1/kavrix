const express = require("express");
const axios = require("axios");
const path = require("path");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// --- CODE CLEANER ---
function cleanCode(text) {
    if (!text) return "";
    let code = text.trim();
    code = code.replace(/```html/g, "").replace(/```/g, "").trim();
    const start = code.indexOf("<​!DOCTYPE html>");
    const end = code.lastIndexOf("<​/html>");
    if (start !== -1 && end !== -1) code = code.substring(start, end + 7);
    return code;
}

// --- GENERATE ENDPOINT ---
app.post("/generate", async (req, res) => {
    const { prompt, existingCode } = req.body;

    // Check of de sleutel er wel echt is
    if (!process.env.API_KEY) {
        console.error("FOUT: Geen API_KEY gevonden in de omgeving!");
        return res.status(500).json({ error: "API_KEY ontbreekt op de server." });
    }

    const systemMessage = `Je bent KAVRIX ENTERPRISE AI. Je bouwt legale, professionele video-applicaties.
    
    RICHTLIJNEN:
    1. Gebruik Tailwind CSS.
    2. Maak apps 100% responsive.
    3. Als de gebruiker vraagt om een videospeler of mediaplayer, bouw dan een interface met HLS.js ondersteuning.
    4. Stuur ALLEEN de HTML code terug. Geen tekst of uitleg.`;

    try {
        console.log("AI aanvraag gestart voor prompt:", prompt);
        
        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: systemMessage },
                    { role: "user", content: existingCode ? `WIJZIG CODE:\n${existingCode}\n\nOPDRACHT: ${prompt}` : `BOUW APP: ${prompt}` }
                ],
                temperature: 0.3
            },
            {
                headers: { 
                    Authorization: `Bearer ${process.env.API_KEY}`, 
                    "Content-Type": "application/json" 
                },
                timeout: 30000 // 30 seconden geduld
            }
        );

        const aiContent = response.data.choices[0].message.content;
        const finalCode = cleanCode(aiContent);

        if (!finalCode) {
            console.error("AI gaf antwoord zonder HTML code.");
            return res.status(500).json({ error: "AI gaf geen geldige code terug." });
        }

        res.json({ code: finalCode });
    } catch (error) {
        console.error("AI ENGINE ERROR:", error.response?.data || error.message);
        
        // Specifieke melding voor de gebruiker
        const errorMsg = error.response?.status === 401 ? "API Key ongeldig." : "AI weigert de opdracht (Filter).";
        res.status(500).json({ error: errorMsg });
    }
});

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kavrix Enterprise Live op ${PORT}`));
