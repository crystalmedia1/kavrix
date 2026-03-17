// server.js
const express = require("express");
const axios = require("axios");
const path = require("path");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Helper: clean AI output to only the HTML between <!DOCTYPE html> ... </html>
function extractHtmlOnly(text) {
  if (!text || typeof text !== "string") return "";
  let code = text.trim();

  // Remove fenced blocks/backticks if present
  code = code.replace(/```html/g, "").replace(/```/g, "").trim();

  const start = code.indexOf("<​!DOCTYPE html>");
  const end = code.lastIndexOf("<​/html>");

  if (start !== -1 && end !== -1 && end > start) {
    code = code.substring(start, end + 7);
  } else if (start !== -1) {
    code = code.substring(start);
  } else if (end !== -1) {
    code = code.substring(0, end + 7);
  }

  return code.trim();
}

// --- DEBUG endpoints ---
app.get("/ping", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

/*
  Debug fetch: test of server via AllOrigins kan fetchen.
  Usage: /debug-fetch?url=<urlencoded target m3u or any url>
*/
app.get("/debug-fetch", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "url param missing" });

  try {
    const proxy = "https://api.allorigins.win/raw?url=" + encodeURIComponent(url);
    const r = await axios.get(proxy, { timeout: 20000 });
    const data = String(r.data || "");
    res.json({
      status: r.status,
      length: data.length,
      head: data.slice(0, 2000) // send first chunk for inspection
    });
  } catch (e) {
    console.error("debug-fetch error:", e.message || e);
    res.status(500).json({ error: e.message || "fetch error" });
  }
});

/*
  Debug AI: klein testprompt naar de AI om te bevestigen dat de model-call werkt.
  (Dit endpoint maakt één korte API-call en retourneert beperkte metadata.)
*/
app.get("/debug-ai", async (req, res) => {
  if (!process.env.API_KEY) {
    return res.status(500).json({ error: "API_KEY not set in environment" });
  }

  try {
    const r = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "You are a test responder." },
          { role: "user", content: "Antwoord kort met: OK" }
        ],
        temperature: 0.0
      },
      {
        headers: { Authorization: `Bearer ${process.env.API_KEY}`, "Content-Type": "application/json" }
      }
    );

    const sample = String(r.data.choices?.[0]?.message?.content || "").slice(0, 200);
    res.json({ ok: true, model: r.data.model || null, sample });
  } catch (e) {
    console.error("debug-ai error:", e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

// --- Main generate endpoint ---
app.post("/generate", async (req, res) => {
  const { prompt = "", existingCode = "" } = req.body;

  if (!process.env.API_KEY) {
    console.error("Missing API_KEY in env");
    return res.status(500).json({ error: "Server misconfigured: API_KEY missing" });
  }

  // Very strict system message to force code-only output
  const systemMessage = `Je bent KAVRIX AI. STRIKTE REGELS:
- Antwoord ALLEEN met volledige HTML code (beginnend met <!DOCTYPE html> en eindigend met </html>).
- GEEN uitleg, GEEN backticks, GEEN tekst voor of na de HTML.
- Voor IPTV: gebruik HLS.js en de AllOrigins proxy: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url).
- Mobile-first UI: video bovenaan, invoerveld en 'Laden' knop, scrollbare zenderlijst onder de video.`;

  const userMessage = existingCode
    ? `HUIDIGE CODE:\n${existingCode}\n\nWIJZIGING: ${prompt}`
    : `BOUW APP VANAF NUL: ${prompt}`;

  try {
    console.log("==== /generate called ====");
    console.log("Prompt length:", prompt.length, "existingCode length:", existingCode.length);

    const aiResp = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: userMessage }
        ],
        temperature: 0.1,
        max_tokens: 2000
      },
      {
        headers: { Authorization: `Bearer ${process.env.API_KEY}`, "Content-Type": "application/json" }
      }
    );

    const raw = String(aiResp.data.choices?.[0]?.message?.content || "");
    console.log("AI raw length:", raw.length);

    let code = extractHtmlOnly(raw);
    console.log("Extracted HTML length:", code.length);

    if (!code || code.length < 10) {
      console.warn("Generated code is empty or too short. Returning error.");
      return res.status(500).json({ error: "AI returned no HTML. Check logs." });
    }

    // Optional: further sanity checks (ensure closing tags exist)
    if (!code.includes("<​!DOCTYPE html>") || !code.includes("<​/html>")) {
      console.warn("Sanity check failed: start or end tags missing.");
      // still return cleaned HTML if present, but flag warning in logs
    }

    // Return cleaned code
    res.json({ code });
  } catch (e) {
    console.error("Generate error:", e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

// Serve index.html at root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kavrix Clean+Debug Engine listening on ${PORT}`));
