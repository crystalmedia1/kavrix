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
function cleanAIResponse(text) {
    if (!text) return "";
    let code = text.trim();
    // Verwijder markdown backticks
    code = code.replace(/```html/g, "").replace(/```/g, "").trim();
    // Pak alleen de HTML kern
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
        return res.status(500).json({ error: "API_KEY niet ingesteld op Render." });
    }

    const systemMessage = `Je bent KAVRIX OS AI, een elite Full-Stack Developer.
    
    JOUW OPDRACHT:
    1. Bouw complete, moderne web-apps met Tailwind CSS.
    2. Zorg dat elke app MOBILE-FIRST is en er prachtig uitziet op smartphones.
    3. Gebruik interactieve elementen (knoppen, animaties, modals).
    4. Stuur ALLEEN de HTML code terug. Geen tekst, geen uitleg, geen praatjes.
    5. Begin ALTIJD met <!DOCTYPE html> en eindig met </html>.`;

    try {
        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: systemMessage },
                    { role: "user", content: existingCode ? `HUIDIGE CODE:\n${existingCode}\n\nPAS AAN: ${prompt}` : `BOUW NIEUWE APP: ${prompt}` }
                ],
                temperature: 0.2
            },
            {
                headers: { Authorization: `Bearer ${process.env.API_KEY}`, "Content-Type": "application/json" }
            }
        );

        const rawContent = response.data.choices[0].message.content;
        const finalCode = cleanAIResponse(rawContent);
        
        res.json({ code: finalCode });
    } catch (error) {
        console.error("AI Error:", error.message);
        res.status(500).json({ error: "AI kon de code niet genereren." });
    }
});

// --- SERVER ROUTES ---
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/ping", (req, res) => res.json({ status: "Kavrix OS Online", version: "5.2" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kavrix OS draait op poort ${PORT}`));
