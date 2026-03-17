const express = require("express");
const axios = require("axios");
const path = require("path");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.post("/generate", async (req, res) => {
  const { prompt, existingCode } = req.body;
  
  // STRENGE INSTRUCTIES: Geen praatjes, alleen code.
  const systemMessage = `Je bent KAVRIX AI, de krachtigste Full-Stack Developer ter wereld.
  
  STRIKTE REGELS:
  1. Antwoord met de VOLLEDIGE HTML code.
  2. Geef GEEN uitleg, GEEN introductie en GEEN tekst voor of na de code.
  3. Begin direct met <!DOCTYPE html> en eindig met </html>.
  4. Gebruik voor IPTV ALTIJD de proxy: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url).
  5. Zorg dat de app MOBILE-FIRST is (geschikt voor smartphones).
  6. Gebruik Tailwind CSS en HLS.js voor video.`;

  const userMessage = existingCode 
    ? `HUIDIGE CODE:\n${existingCode}\n\nPAS DEZE CODE AAN OP BASIS VAN DIT BEVEL: ${prompt}. Stuur alleen de nieuwe volledige code terug.`
    : `BOUW DEZE APP VANAF NUL: ${prompt}. Stuur alleen de volledige HTML code terug.`;

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile", 
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: userMessage }
        ],
        temperature: 0.1 // Extreem laag voor maximale focus op code
      },
      {
        headers: { Authorization: `Bearer ${process.env.API_KEY}`, "Content-Type": "application/json" }
      }
    );
    
    let code = response.data.choices[0].message.content.trim();
    
    // Extra beveiliging: Verwijder alles wat geen HTML is
    if (code.includes("<​!DOCTYPE html>")) {
        code = code.substring(code.indexOf("<​!DOCTYPE html>"));
    }
    if (code.includes("<​/html>")) {
        code = code.substring(0, code.indexOf("<​/html>") + 7);
    }

    res.json({ code });
  } catch (error) {
    res.status(500).json({ error: "Error" });
  }
});

app.get("/", (req, res) => { res.sendFile(path.join(__dirname, "index.html")); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kavrix v4.4 Live`));
