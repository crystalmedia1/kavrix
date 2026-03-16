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
        model: "llama3-70b-8192", 
        messages: [
          { 
            role: "system", 
            content: "Je bent een expert web developer. Antwoord ALLEEN met de volledige HTML/CSS/JS code in één bestand. Geen uitleg, geen markdown code blocks, alleen de code zelf." 
          },
          { role: "user", content: `Bouw een web app voor: ${prompt}` }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );
    
    // We halen de code uit het antwoord van Groq
    const generatedCode = response.data.choices[0].message.content;
    res.json({ code: generatedCode });
  } catch (error) {
    console.error("Fout:", error.response?.data || error.message);
    res.status(500).json({ error: "AI foutmelding" });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server draait op poort ${PORT}`));
