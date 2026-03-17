const express = require("express");
const axios = require("axios");
const path = require("path");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// --- HULPFUNCTIE: CODE SCHOONMAKEN ---
function cleanCode(text) {
    if (!text) return "";
    let code = text.trim();
    // Verwijder markdown blokken
    code = code.replace(/```html/g, "").replace(/```/g, "").trim();
    // Snij alles buiten de HTML tags weg
    const start = code.indexOf("<​!DOCTYPE html>");
    const end = code.lastIndexOf("<​/html>");
    if (start !== -1 && end !== -1) {
        code = code.substring(start, end + 7);
    }
    return code;
}

// --- GENERATE ENDPOINT ---
app.post("/generate", async (req, res) => {
    const { prompt, existingCode } = req.body;

    if (!process.env.API_KEY) {
        return res.status(500).json({ error: "API_KEY ontbreekt in Render instellingen!" });
    }

    const systemMessage = `Je bent KAVRIX AI ARCHITECT. Je bouwt apps die DIRECT werken.
    
    STRIKTE TECHNISCHE WETTEN:
    1. UI: Gebruik Tailwind CSS. Maak alles MOBILE-FIRST.
    2. IPTV LOGICA: 
       - Gebruik HLS.js (https://cdn.jsdelivr.net/npm/hls.js@latest).
       - Gebruik ALTIJD 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url) voor M3U fetch.
       - Schrijf een parser die ELKE regel checkt: als regel begint met #EXTINF, pak naam. Volgende regel is URL.
    3. OUTPUT: Stuur ALLEEN de HTML code. Geen tekst, geen uitleg. Begin met <!DOCTYPE html>.
    4. INTERACTIE: Zorg dat knoppen duidelijk zijn en feedback geven (bijv. 'Laden...').`;

    const userMessage = existingCode 
        ? `HUIDIGE CODE:\n${existingCode}\n\nGEWENSTE AANPASSING (VOER DIT 100% UIT): ${prompt}`
        : `BOUW EEN NIEUWE APP: ${prompt}`;

    try {
        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: systemMessage },
                    { role: "user", content: userMessage }
                ],
                temperature: 0.1 // Maximale precisie, geen gefantaseer
            },
            {
                headers: { Authorization: `Bearer ${process.env.API_KEY}`, "Content-Type": "application/json" }
            }
        );

        let finalCode = cleanCode(response.data.choices[0].message.content);
        res.json({ code: finalCode });
    } catch (error) {
        console.error("Fout:", error.response?.data || error.message);
        res.status(500).json({ error: "AI Engine kon niet antwoorden." });
    }
});

// --- DEBUG ENDPOINTS ---
app.get("/ping", (req, res) => res.json({ status: "Kavrix Online", time: new Date() }));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kavrix Engine v5.0 Live op poort ${PORT}`));
