const express = require("express");
const axios = require("axios");
const path = require("path");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Server-side proxy voor externe fetches (zoals IPTV M3U)
app.get("/proxy-m3u", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send("URL ontbreekt");

  const config = {
    timeout: 20000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      Accept: "*/*",
    },
  };

  try {
    const response = await axios.get(url, config);
    res.send(response.data);
  } catch (error) {
    try {
      const backupUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(
        url
      )}`;
      const backupResponse = await axios.get(backupUrl, config);
      res.send(backupResponse.data);
    } catch (backupError) {
      res
        .status(500)
        .send("Kon de lijst niet ophalen. Controleer of de link nog werkt.");
    }
  }
});

// Helper om AI output te cleanen
function cleanCode(text) {
  if (!text) return "";
  let code = text.trim();
  code = code.replace(/```html/g, "").replace(/```/g, "").trim();
  const start = code.indexOf("<​!DOCTYPE html>");
  const end = code.lastIndexOf("<​/html>");
  if (start !== -1 && end !== -1) {
    code = code.substring(start, end + 7);
  }
  return code;
}

// AI generate endpoint
app.post("/generate", async (req, res) => {
  const { prompt, existingCode } = req.body;

  if (!process.env.API_KEY) {
    return res.status(500).json({ error: "API_KEY niet gevonden in Render!" });
  }

  const backendUrl = "https://kavrix.onrender.com";

  const systemMessage = `Je bent KAVRIX AI. Je bouwt apps die 100% werken op mobiel.

IPTV PROTOCOL (VERPLICHT):
1. Gebruik HLS.js voor de video player.
2. Gebruik voor het laden van de M3U ALTIJD dit pad: '${backendUrl}/proxy-m3u?url=' + encodeURIComponent(inputUrl).
3. De parser moet ELKE regel van de tekst scannen. Als een regel begint met #EXTINF, pak de naam na de laatste komma. De VOLGENDE regel is de stream URL.
4. UI: Video bovenaan (sticky), daaronder invoerveld + 'START' knop, daaronder de zenderlijst.
5. Gebruik Tailwind CSS voor een modern donker thema.

OUTPUT: Stuur ALLEEN de HTML code. Geen tekst ervoor of erna.`;

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemMessage },
          {
            role: "user",
            content: existingCode
              ? `WIJZIG DEZE CODE: ${existingCode}\n\nOPDRACHT: ${prompt}`
              : `BOUW NIEUWE APP: ${prompt}`,
          },
        ],
        temperature: 0.1,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    let finalCode = cleanCode(response.data.choices[0].message.content);
    res.json({ code: finalCode });
  } catch (error) {
    res
      .status(500)
      .json({ error: error.response?.data || "AI kon niet antwoorden." });
  }
});

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/ping", (req, res) => res.json({ status: "Kavrix v6.0 Online" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kavrix Engine v6.0 draait op poort ${PORT}`));
