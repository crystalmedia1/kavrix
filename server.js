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
  
  const systemMessage = `Je bent KAVRIX AI. 
  BELANGRIJK: Bouw apps die 100% MOBILE-FIRST zijn (geschikt voor smartphones).
  
  VOOR IPTV APPS:
  1. Gebruik ALTIJD 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url) voor de M3U.
  2. PARSER: Gebruik een simpele regex: /#EXTINF.*?,(.*)\\n(http.*)/g om namen en URLs te vinden.
  3. UI: Maak een lijst die onder de video staat op mobiel, niet ernaast.
  
  ALGEMENE REGELS:
  - Gebruik Tailwind CSS.
  - Antwoord ALLEEN met pure HTML code.
  - Geen markdown blocks.`;

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile", 
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: existingCode ? `PAS DEZE CODE AAN: ${existingCode}\n\nWIJZIGING: ${prompt}` : `BOUW APP: ${prompt}` }
        ],
        temperature: 0.2
      },
      {
        headers: { Authorization: `Bearer ${process.env.API_KEY}`, "Content-Type": "application/json" }
      }
    );
    
    let code = response.data.choices[0].message.content.trim();
    code = code.replace(/^```html/i, "").replace(/```$/i, "");
    res.json({ code });
  } catch (error) {
    res.status(500).json({ error: "Error" });
  }
});

app.get("/", (req, res) => { res.sendFile(path.join(__dirname, "index.html")); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kavrix v4.3 Live`));
