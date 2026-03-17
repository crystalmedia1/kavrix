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
  
  const systemMessage = `Je bent KAVRIX AI. Bouw een professionele web-app.
  
  VOOR IPTV APPS (STRIKT VOLGEN):
  1. Gebruik HLS.js voor video.
  2. Gebruik ALTIJD deze proxy voor de M3U fetch: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url).
  3. PARSER LOGICA: Gebruik een loop die zoekt naar '#EXTINF'. Pak de naam na de komma. De regel daarna is de URL.
  4. UI: Maak een invoerveld, een 'Laden' knop, en een scrollbare lijst met zenders onder de video.
  
  OUTPUT REGELS:
  - Antwoord ALLEEN met de HTML code beginnend met <!DOCTYPE html>.
  - Geen tekst of uitleg.`;

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile", 
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: existingCode ? `PAS AAN: ${existingCode}\n\nWIJZIGING: ${prompt}` : `BOUW: ${prompt}` }
        ],
        temperature: 0.1
      },
      {
        headers: { Authorization: `Bearer ${process.env.API_KEY}`, "Content-Type": "application/json" }
      }
    );
    
    let code = response.data.choices[0].message.content.trim();
    const start = code.indexOf("<​!DOCTYPE html>");
    const end = code.lastIndexOf("<​/html>");
    if (start !== -1 && end !== -1) code = code.substring(start, end + 7);

    res.json({ code });
  } catch (error) {
    res.status(500).json({ error: "Error" });
  }
});

app.get("/", (req, res) => { res.sendFile(path.join(__dirname, "index.html")); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kavrix v4.7 Live`));
