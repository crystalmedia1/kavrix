const express = require("express");
const axios = require("axios");
const path = require("path");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Zorgt dat grote apps verstuurd kunnen worden
app.use(express.static(__dirname));

// --- HULPFUNCTIE: CODE SCHOONMAKEN ---
function cleanCode(text) {
    if (!text) return "";
    let code = text.trim();
    code = code.replace(/```html/g, "").replace(/```/g, "").trim();
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
    const API_KEY = process.env.API_KEY;

    if (!API_KEY) {
        return res.status(500).json({ error: "API_KEY niet gevonden op Render." });
    }

    // We maken de bestaande code korter voor de AI om crashes te voorkomen
    const shortCode = existingCode ? existingCode.substring(0, 15000) : "";

    const systemMessage = `Je bent KAVRIX PRO, een expert web developer. 
    Bouw ALTIJD een volledige HTML pagina met Tailwind CSS. 
    Geen uitleg, alleen code beginnend met <!DOCTYPE html>.`;

    try {
        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                // We gebruiken het '8b' model voor updates, dit is veel stabieler voor herhaalde verzoeken
                model: "llama-3.1-8b-instant", 
                messages: [
                    { role: "system", content: systemMessage },
                    { 
                        role: "user", 
                        content: existingCode 
                            ? `Hier is de huidige code:\n${shortCode}\n\nPas dit aan volgens deze wens: ${prompt}. Geef de VOLLEDIGE nieuwe code terug.` 
                            : `Bouw een nieuwe app: ${prompt}` 
                    }
                ],
                temperature: 0.1, // Lager is stabieler
                max_tokens: 8000
            },
            {
                headers: { 
                    "Authorization": `Bearer ${API_KEY}`,
                    "Content-Type": "application/json" 
                },
                timeout: 60000 // We geven de AI 60 seconden de tijd
            }
        );

        const aiResponse = response.data.choices[0].message.content;
        const finalCode = cleanCode(aiResponse);

        if (!finalCode) throw new Error("AI gaf geen geldige code terug.");
        res.json({ code: finalCode });

    } catch (error) {
        console.error("SERVER FOUT:", error.response?.data || error.message);
        
        // Als het 8b model ook faalt, proberen we een laatste keer zonder de oude code mee te sturen
        res.status(500).json({ 
            error: "AI weigert de update. Tip: Klik op 'Reset Project' en probeer je opdracht in één keer uitgebreider te omschrijven." 
        });
    }
});

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kavrix Server v8.0 Live`));
