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
            content: `Je bent KAVRIX AI. Antwoord ALLEEN met de pure HTML/CSS/JS code. 
            BELANGRIJK: Gebruik GEEN markdown code blocks (dus GEEN \`\`\`html aan het begin of eind). 
            Begin direct met <!DOCTYPE html>.
            
            Voor IPTV apps: Gebruik 'https://cors-anywhere.herokuapp.com/' voor de M3U fetch om CORS problemen te voorkomen, of leg uit dat de gebruiker een CORS-extensie nodig heeft.` 
          },
          { role: "user", content: `Bouw een high-end applicatie voor: ${prompt}` }
        ],
        temperature: 0.3 // Lager voor minder fouten in de code
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );
    
    let generatedCode = response.data.choices[0].message.content.trim();
    
    // Extra beveiliging om markdown te verwijderen als de AI het toch doet
    generatedCode = generatedCode.replace(/^```html/i, "").replace(/```$/i, "");

    res.json({ code: generatedCode });
  } catch (error) {
    console.error("Fout:", error.response?.data || error.message);
    res.status(500).json({ error: "AI Engine Foutmelding" });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kavrix Engine draait op poort ${PORT}`));
