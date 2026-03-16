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
  
  const systemMessage = existingCode 
    ? `Je bent KAVRIX AI. Je MOET de bestaande code strikt aanpassen op basis van de instructie: "${prompt}".
       - Verander ALLEEN wat gevraagd wordt, maar behoud de rest van de functionaliteit.
       - Als de gebruiker zegt dat iets niet werkt, zoek dan een alternatieve oplossing (bijv. andere proxy of library).
       - Antwoord ALLEEN met de volledige, verbeterde HTML code.`
    : `Je bent KAVRIX AI, een Senior Full-Stack Architect. Bouw een complete, professionele web-app in één HTML bestand.
       - Gebruik Tailwind CSS en FontAwesome.
       - Gebruik ALTIJD 'https://api.allorigins.win/raw?url=' voor externe data.
       - Zorg dat de UI modern en responsive is.
       - Antwoord ALLEEN met pure HTML code zonder markdown blocks.`;

  const userMessage = existingCode 
    ? `HUIDIGE CODE:\n${existingCode}\n\nGEWENSTE AANPASSING: ${prompt}`
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
        temperature: 0.2 // Lager voor meer precisie bij aanpassingen
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
app.listen(PORT, () => console.log(`Kavrix Architect v4.2 Live`));
