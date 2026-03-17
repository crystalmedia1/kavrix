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
  
  const systemMessage = `Je bent KAVRIX AI. Bouw een professionele web-app.
  STRIKTE REGELS:
  - Antwoord ALLEEN met de HTML code.
  - GEEN uitleg, GEEN backticks, GEEN \`\`\`html blokken.
  - Begin direct met <!DOCTYPE html>.
  - Gebruik voor IPTV: HLS.js en de AllOrigins proxy.`;

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile", 
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: existingCode ? `PAS AAN: ${existingCode}\n\nWIJZIGING: ${prompt}` : `BOUW: ${prompt}` }
        ],
        temperature: 0.1
      },
      {
        headers: { Authorization: `Bearer ${process.env.API_KEY}`, "Content-Type": "application/json" }
      }
    );
    
    let code = response.data.choices[0].message.content.trim();
    
    // --- DE ULTIEME SCHOONMAAK LOGICA ---
    // Zoek het begin van de HTML
    const htmlStart = code.indexOf("<​!DOCTYPE html>");
    if (htmlStart !== -1) {
        code = code.substring(htmlStart);
    }
    
    // Zoek het einde van de HTML en snij alles daarna weg
    const htmlEnd = code.lastIndexOf("<​/html>");
    if (htmlEnd !== -1) {
        code = code.substring(0, htmlEnd + 7);
    }

    // Verwijder eventuele overgebleven backticks
    code = code.replace(/```html/g, "").replace(/```/g, "").trim();

    res.json({ code });
  } catch (error) {
    res.status(500).json({ error: "Error" });
  }
});

app.get("/", (req, res) => { res.sendFile(path.join(__dirname, "index.html")); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kavrix v4.6 Clean Engine Live`));
