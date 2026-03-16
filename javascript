const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.static("public"));
app.use(express.json());

// Route voor AI-codegeneratie
app.post("/generate", async (req, res) => {
  const { prompt } = req.body;

  try {
    const response = await axios.post(
      "https://routellm.abacus.ai/v1/chat/completions",
      {
        model: "route-llm",
        messages: [
          {
            role: "system",
            content: "Je bent een expert web developer. Antwoord ALLEEN met de volledige HTML/CSS/JS code in één bestand."
          },
          {
            role: "user",
            content: `Bouw een web app voor: ${prompt}`
          }
        ],
        temperature: 0.5
      },
      {
        headers: {
          Authorization: `Bearer JOUW_ABACUS_API_KEY`,
          "Content-Type": "application/json"
        }
      }
    );

    const code = response.data.choices[0].message.content.trim();
    res.json({ code });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Kon geen code genereren." });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server draait op http://localhost:${PORT}`);
});
