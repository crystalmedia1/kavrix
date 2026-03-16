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
            content: `Je bent KAVRIX AI. Bouw een IPTV player die CORS-problemen omzeilt.
            
            INSTRUCTIES VOOR DE CODE:
            1. Gebruik 'https://api.allorigins.win/raw?url=' voor elk fetch-verzoek naar een M3U-lijst. Dit omzeilt CORS-blokkades.
            2. Gebruik HLS.js voor de video-player zodat .m3u8 streams werken.
            3. Zorg dat de M3U-parser robuust is en ook namen van zenders uit de #EXTINF regels haalt.
            4. Antwoord ALLEEN met de pure HTML/CSS/JS code zonder markdown blocks.` 
          },
          { role: "user", content: `Bouw een high-end IPTV player voor: ${prompt}` }
        ],
        temperature: 0.2
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
app.listen(PORT, () => console.log(`Kavrix Engine v2.1 Live`));
