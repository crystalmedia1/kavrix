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
            content: `Je bent KAVRIX AI, een Senior Full-Stack Developer. Je bouwt universele web-apps.

            CRUCIALE INSTRUCTIES VOOR DATA & MEDIA:
            1. EXTERNE DATA: Gebruik ALTIJD 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url) voor fetch-verzoeken naar externe bronnen (M3U, API's, JSON).
            2. M3U PARSING LOGICA: 
               - Split de tekst op '\\n'.
               - Loop door de regels. Als een regel begint met '#EXTINF', haal de naam van de zender eruit (alles na de laatste komma).
               - De regel direct NA de '#EXTINF' regel is de stream-URL.
               - Sla deze op in een array van objecten: { name, url }.
            3. VIDEO: Gebruik HLS.js voor .m3u8 streams. Voeg een foutafhandeling toe (hls.on(Hls.Events.ERROR)).
            4. UI: Gebruik Tailwind CSS. Maak een sidebar voor navigatie en een hoofdvenster voor content.
            
            OUTPUT:
            - Antwoord ALLEEN met pure HTML/CSS/JS code.
            - GEEN markdown code blocks.
            - Begin direct met <!DOCTYPE html>.` 
          },
          { role: "user", content: `Bouw een professionele applicatie voor: ${prompt}` }
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
    console.error("Fout:", error.response?.data || error.message);
    res.status(500).json({ error: "Kavrix Engine Error" });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kavrix Master Engine Live`));
