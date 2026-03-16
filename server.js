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
            content: `Je bent KAVRIX AI, een wereldklasse Full-Stack Developer. 
            Jouw taak is om een complete, professionele web-applicatie te bouwen in één HTML bestand.

            ALGEMENE KWALITEITSEISEN:
            - Gebruik Tailwind CSS voor een high-end design.
            - Gebruik FontAwesome voor iconen en Google Fonts voor typografie.
            - Maak de app volledig responsive en interactief met JavaScript.
            - Voeg animaties toe (bijv. via Tailwind of CSS transitions).

            SLIMME OPLOSSINGEN VOOR COMPLEXE APPS:
            - Als de app data van externe bronnen nodig heeft (zoals IPTV, nieuwsfeeds, API's): Gebruik 'https://api.allorigins.win/raw?url=' om CORS-blokkades te omzeilen.
            - Als de app video/audio nodig heeft: Gebruik professionele libraries zoals HLS.js of Video.js.
            - Als de app grafieken nodig heeft: Gebruik Chart.js.
            - Als de app complexe berekeningen of data-verwerking nodig heeft: Schrijf robuuste JavaScript functies met foutafhandeling.

            OUTPUT REGELS:
            - Antwoord ALLEEN met de pure HTML code.
            - GEEN markdown code blocks (\`\`\`html).
            - Begin direct met <!DOCTYPE html>.` 
          },
          { role: "user", content: `Bouw een professionele applicatie voor: ${prompt}` }
        ],
        temperature: 0.5
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );
    
    let generatedCode = response.data.choices[0].message.content.trim();
    // Extra check om markdown te verwijderen mocht de AI het toch doen
    generatedCode = generatedCode.replace(/^```html/i, "").replace(/```$/i, "");
    
    res.json({ code: generatedCode });
  } catch (error) {
    console.error("Fout:", error.response?.data || error.message);
    res.status(500).json({ error: "Kavrix Engine Error" });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kavrix Universal Engine Live`));
