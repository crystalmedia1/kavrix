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
            content: `Je bent KAVRIX AI. Bouw een IPTV player die zowel HTTP als HTTPS links ondersteunt.
            
            TECHNISCHE EISEN VOOR DE CODE:
            1. M3U LADEN: Gebruik ALTIJD 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url) om de lijst op te halen. Dit lost CORS en Mixed Content (HTTP op HTTPS) op voor de tekstlijst.
            2. PARSING: Split de M3U tekst op regels. Zoek naar '#EXTINF'. De regel direct daarna is de stream-URL. Haal de zendernaam uit de #EXTINF regel.
            3. VIDEO PLAYER: Gebruik HLS.js. BELANGRIJK: Als een stream-URL begint met 'http://', waarschuw de gebruiker dan dat browsers HTTP-video op een HTTPS-site vaak blokkeren tenzij ze een 'Insecure Content' instelling aanpassen.
            4. UI: Maak een moderne sidebar voor de zenders en een grote player.
            5. Antwoord ALLEEN met de pure HTML/CSS/JS code zonder markdown blocks.` 
          },
          { role: "user", content: `Bouw een robuuste IPTV player voor: ${prompt}` }
        ],
        temperature: 0.1
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
app.listen(PORT, () => console.log(`Kavrix Engine v2.3 Live`));
