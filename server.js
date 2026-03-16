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
            content: `Je bent KAVRIX AI, de meest geavanceerde web-app generator ter wereld. 
            Jouw doel is om VOLLEDIG FUNCTIONELE, MODERNE en PROFESSIONELE web-apps te bouwen in één enkel HTML bestand.
            
            RICHTLIJNEN:
            - Gebruik Tailwind CSS voor prachtige styling.
            - Gebruik FontAwesome voor iconen.
            - Zorg dat de app responsive is (werkt op mobiel en desktop).
            - Voeg interactieve JavaScript toe zodat de app echt werkt.
            - Gebruik moderne UI/UX patronen (glassmorphism, gradients, schaduwen).
            - Antwoord ALLEEN met de code. Geen tekst ervoor of erna, geen markdown code blocks.` 
          },
          { role: "user", content: `Bouw een high-end applicatie voor: ${prompt}` }
        ],
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );
    
    const generatedCode = response.data.choices[0].message.content;
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
