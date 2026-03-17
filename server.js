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
  
  const systemMessage = `Je bent KAVRIX AI. Bouw een professionele, mobile-first web-app.
  
  ALS DE GEBRUIKER EEN IPTV PLAYER WIL, GEBRUIK DAN DIT EXACTE RECEPT:
  1. Gebruik HLS.js voor de video.
  2. Gebruik deze FETCH functie voor de M3U: 
     fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(url))
     .then(r => r.text())
     .then(data => {
        const lines = data.split('\\n');
        const channels = [];
        for(let i=0; i<lines.length; i++) {
           if(lines[i].startsWith('#EXTINF')) {
              const name = lines[i].split(',').pop();
              const url = lines[i+1].trim();
              channels.push({name, url});
           }
        }
        // Toon de kanalen in de UI...
     });
  3. Zorg dat de lijst ONDER de video staat voor mobiel gebruik.
  
  STRIKTE REGELS:
  - Antwoord ALLEEN met de volledige HTML code.
  - Geen uitleg of tekst voor/na de code.
  - Begin met <!DOCTYPE html>.`;

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
    if (code.includes("<​!DOCTYPE html>")) code = code.substring(code.indexOf("<​!DOCTYPE html>"));
    if (code.includes("<​/html>")) code = code.substring(0, code.indexOf("<​/html>") + 7);

    res.json({ code });
  } catch (error) {
    res.status(500).json({ error: "Error" });
  }
});

app.get("/", (req, res) => { res.sendFile(path.join(__dirname, "index.html")); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kavrix v4.5 Live`));
