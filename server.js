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

    if (!process.env.API_KEY) {
        return res.status(500).json({ error: "API_KEY ontbreekt." });
    }

    const systemMessage = `Je bent KAVRIX ENTERPRISE AI. Je bouwt high-end applicaties.
    
    RICHTLIJNEN:
    1. Gebruik Tailwind CSS voor styling.
    2. Maak apps die 100% responsive zijn (Mobile & Desktop).
    3. Voeg geavanceerde functies toe zoals LocalStorage opslag, animaties en filters.
    4. Stuur ALLEEN de HTML code terug. Geen tekst of uitleg.
    5. Begin met <!DOCTYPE html>.`;

    try {
        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: systemMessage },
                    { role: "user", content: existingCode ? `WIJZIG CODE:\n${existingCode}\n\nOPDRACHT: ${prompt}` : `BOUW APP: ${prompt}` }
                ],
                temperature: 0.2
            },
            {
                headers: { Authorization: `Bearer ${process.env.API_KEY}`, "Content-Type": "application/json" }
            }
        );

        res.json({ code: cleanCode(response.data.choices[0].message.content) });
    } catch (error) {
        res.status(500).json({ error: "AI Engine Error" });
    }
});

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kavrix Enterprise Live op ${PORT}`));
