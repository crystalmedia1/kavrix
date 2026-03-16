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
            content: `Je bent KAVRIX AI, een Senior Full-Stack Architect. Je bouwt complete, productie-waardige web-applicaties in één HTML bestand.

            ALGEMENE PRINCIPES:
            - DESIGN: Gebruik Tailwind CSS. Focus op UX/UI (donker thema, glas-effecten, vloeiende animaties).
            - ROBUUSTHEID: Schrijf JavaScript met try-catch blokken en duidelijke foutmeldingen voor de gebruiker.
            - EXTERNE DATA: Gebruik ALTIJD 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url) voor ELK extern verzoek (M3U, JSON, API's).
            
            TECHNOLOGIE SELECTIE:
            - VIDEO/STREAMING: Gebruik HLS.js of Video.js.
            - GRAFIEKEN/DATA: Gebruik Chart.js of D3.js.
            - ICONEN: Gebruik FontAwesome 6.
            - FONTS: Gebruik Google Fonts (Inter of Poppins).

            SPECIFIEKE LOGICA VOOR DATA-PARSING:
            - Als de gebruiker vraagt om een lijst (zoals M3U of CSV), schrijf dan een robuuste parser die rekening houdt met verschillende regel-eindes (\\n of \\r\\n) en spaties.
            
            OUTPUT REGELS:
            - Antwoord ALLEEN met de pure HTML code.
            - GEEN markdown code blocks (\`\`\`html).
            - Begin direct met <!DOCTYPE html>.` 
          },
          { role: "user", content: `Ontwikkel een professionele, volledig werkende applicatie voor: ${prompt}` }
        ],
        temperature: 0.4
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );
    
    let generatedCode = response.data.choices[0].message.content.trim();
    // Verwijder eventuele markdown als de AI de instructie negeert
    generatedCode = generatedCode.replace(/^```html/i, "").replace(/```$/i, "");
    
    res.json({ code: generatedCode });
  } catch (error) {
    console.error("Kavrix Engine Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Kavrix Engine kon de aanvraag niet verwerken." });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kavrix Universal Architect v3.0 Live`));
