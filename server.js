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
  const { prompt } = req.body;
  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile", 
        messages: [
          { 
            role: "system", 
            content: `Je bent KAVRIX AI. Bouw een IPTV player die GEGARANDEERD werkt.
            
            GEBRUIK DEZE EXACTE LOGICA IN DE CODE:
            1. Gebruik 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url) om de M3U lijst op te halen.
            2. Gebruik deze parser-logica: Splits de tekst op '\\n'. Zoek naar regels die beginnen met '#EXTINF'. De regel DAARNA is de stream-URL.
            3. Toon de zenders in een lijst aan de linkerkant.
            4. Gebruik HLS.js (https://cdn.jsdelivr.net/npm/hls.js@latest) voor de video player.
            5. Voeg console.log() toe aan de code zodat we fouten kunnen zien in de browser-inspectie.
            6. Antwoord ALLEEN met de pure HTML/CSS/JS code zonder markdown blocks.` 
          },
          { role: "user", content: `Bouw een werkende IPTV player voor: ${prompt}` }
        ],
        temperature: 0.1 // Zeer laag voor maximale precisie
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );
    
    let generatedCode = response.data.choices[0].message.content.trim();
    generatedCode = generatedCode.replace(/^```html/i, "").replace(/```$/i, "");
    res.json({ code: generatedCode });
  } catch (error) {
    res.status(500).json({ error: "AI Engine Fout" });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kavrix Engine v2.2 Live`));
