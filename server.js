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
  
  // Bepaal of het een nieuwe build is of een aanpassing
  const systemMessage = existingCode 
    ? `Je bent KAVRIX AI. De gebruiker heeft al een app gebouwd (zie hieronder). 
       Pas de bestaande code aan op basis van de nieuwe instructie: "${prompt}".
       Behoud de goede functies, maar verander wat gevraagd wordt.
       Antwoord ALLEEN met de volledige, nieuwe HTML code.`
    : `Je bent KAVRIX AI, een Senior Full-Stack Architect. Bouw een complete, professionele web-app in één HTML bestand.
       Gebruik Tailwind CSS, FontAwesome en moderne JS libraries (HLS.js, Chart.js, etc.) waar nodig.
       Gebruik ALTIJD 'https://api.allorigins.win/raw?url=' voor externe data fetch.
       Antwoord ALLEEN met pure HTML code zonder markdown blocks.`;

  const userMessage = existingCode 
    ? `HUIDIGE CODE:\n${existingCode}\n\nINSTRUCTIE VOOR WIJZIGING: ${prompt}`
    : `Bouw een professionele applicatie voor: ${prompt}`;

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile", 
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: userMessage }
        ],
        temperature: 0.3
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
app.listen(PORT, () => console.log(`Kavrix Architect v4.0 Live`));
