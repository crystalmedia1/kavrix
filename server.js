// server.js
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Supabase client - zorg dat SUPABASE_URL en SUPABASE_KEY in .env staan
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// ---------- Config ----------
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const API_KEY = process.env.API_KEY; // Groq primary key
const BACKUP_API_KEY = process.env.BACKUP_API_KEY || null; // optioneel
const MODELS_FALLBACK = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "mixtral-8x7b-32768"
];

// ---------- Utilities ----------
// Strip markdown fences and find the first HTML tag. Try to return a valid HTML document.
function cleanCode(text) {
  if (!text) return "";

  let code = text.replace(/```(?:html|javascript|js)?/gi, "");
  code = code.replace(/```/g, "").trim();

  // If output contains "```html" fenced blocks with content inside, remove fences above already did
  // Find first '<' that's likely an HTML tag
  const firstTagIdx = code.search(/<\s*(?:!doctype|html|div|head|body|!DOCTYPE|<!doctype)/i);
  if (firstTagIdx !== -1) {
    code = code.substring(firstTagIdx);
  } else {
    // If no obvious html tag, still try to find any '<'
    const anyTag = code.indexOf("<");
    if (anyTag !== -1) code = code.substring(anyTag);
  }

  code = code.trim();

  // If a closing </html> exists, cut anything after it
  const endIdx = code.lastIndexOf("<​/html>");
  if (endIdx !== -1) {
    code = code.substring(0, endIdx + 7);
  } else {
    // Try to ensure it's wrapped as an HTML document if it looks like a fragment
    if (!/^<!doctype html>/i.test(code) && !/^<html/i.test(code)) {
      // If it begins with <body> or <div> etc., wrap minimally
      if (code.startsWith("<")) {
        code = `<!DOCTYPE html>\n<html lang="nl">\n<head>\n<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n<title>Agent Preview</title>\n</head>\n<body>\n${code}\n</body>\n</html>`;
      } else {
        // If it's not html at all, return an HTML that shows the raw text (fallback)
        const safe = escapeHtml(code);
        code = `<!DOCTYPE html>\n<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agent Output</title></head><body><pre style="white-space:pre-wrap;word-wrap:break-word;padding:20px;font-family:monospace;">${safe}</pre></body></html>`;
      }
    }
  }

  return code;
}

function escapeHtml(unsafe) {
  return unsafe
    .replaceAll("&", "&amp;")
    .replaceAll("<​", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Basic validation check - returns { valid: boolean, reason?: string }
function validateCode(code) {
  if (!code) return { valid: false, reason: "Geen code gegenereerd." };
  const hasHtmlTag = /<\s*html/i.test(code) || /<!doctype/i.test(code);
  const hasClosingHtml = /<\/\s*html\s*>/i.test(code);
  const hasBody = /<\s*body/i.test(code);
  if (!hasHtmlTag || !hasClosingHtml) {
    return { valid: false, reason: "HTML-structuur lijkt incompleet (ontbreekt <!DOCTYPE/html of </html>)" };
  }
  // Additional lightweight checks could be added here (unclosed tags etc.)
  return { valid: true };
}

// Heuristic: determine whether prompt is a "small edit" (fast model) or a big feature (heavy model)
function isSmallEdit(prompt) {
  if (!prompt) return false;
  const len = prompt.trim().length;
  const smallKeywords = ["maak", "kleur", "verander", "wijzig", "klein", "font", "lettergrootte", "marge", "padding", "kleur", "achtergrond", "pad"];
  const lower = prompt.toLowerCase();
  const keywordFound = smallKeywords.some(k => lower.includes(k));
  return len < 80 || keywordFound;
}

// ---------- Groq (AI) Caller with fallback ----------
async function groqCall({ model, messages, apiKey = API_KEY, timeout = 60000 }) {
  const payload = {
    model,
    messages,
    temperature: 0.18,
    max_tokens: 4000
  };

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };

  const resp = await axios.post(GROQ_API_URL, payload, { headers, timeout });
  return resp.data;
}

// Try models in sequence until successful or all fail. Handles 429 by trying next.
async function callAIWithFallback({ prompt, context = "", preferLightModel = false, apiKey = API_KEY }) {
  const models = preferLightModel
    ? MODELS_FALLBACK.slice().reverse() // try lighter models first for edits
    : MODELS_FALLBACK; // heavy-to-light for big changes

  let lastError = null;

  for (const model of models) {
    try {
      console.log(`KAVRIX: trying model ${model}`);
      const messages = [
        {
          role: "system",
          content:
            "Je bent KAVRIX DEEP-AGENT. Je response moet ALTIJD een complete, werkende HTML-bestandstekst zijn wanneer gevraagd om UI-code. Geef geen uitleg. Indien gevraagd om alleen code, retourneer alléén de HTML (beginnend met <!DOCTYPE html> of <html>)."
        },
        {
          role: "user",
          content: `${context}\n\nNIEUWE OPDRACHT: ${prompt}\n\nLET OP: Als je code teruggeeft, geef dan alleen de volledige HTML, zonder extra uitleg of backticks.`
        }
      ];

      const data = await groqCall({ model, messages, apiKey });
      const text = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text;
      if (!text) throw new Error("Geen tekst in AI-response");

      return { text, modelUsed: model, raw: data };
    } catch (err) {
      lastError = err;
      // If rate-limited or model exhausted, try next model
      const status = err?.response?.status;
      if (status === 429 || (err?.response?.data && typeof err.response.data === "string" && err.response.data.toLowerCase().includes("rate limit"))) {
        console.warn(`Model ${model} rate-limited. Trying next model.`);
        continue;
      } else {
        // For other errors, still try next model once, but if it's not recoverable, break and rethrow after loop
        console.warn(`Model ${model} returned error: ${err.message}`);
        continue;
      }
    }
  }

  throw lastError || new Error("Alle modellen faalden");
}

// ---------- Context helpers ----------
async function getProjectContext(projectId) {
  if (!projectId) return "";
  const { data, error } = await supabase.from("projects").select("prompt, code, updated_at").eq("id", projectId).single();
  if (error || !data) return "";
  // provide a concise context (limit length)
  const codeSnippet = (data.code || "").slice(0, 1500); // avoid sending huge code
  return `EERDERE OPDRACHT: "${data.prompt}"\nLAATSTE CODE (ingekort):\n${codeSnippet}\n\n`;
}

// ---------- Endpoints ----------

// Get list of projects
app.get("/projects", async (req, res) => {
  try {
    const { data, error } = await supabase.from("projects").select("id, name, created_at").order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get a single project
app.get("/project/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const { data, error } = await supabase.from("projects").select("*").eq("id", id).single();
    if (error) return res.status(404).json({ error: "Niet gevonden" });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate / update code
app.post("/generate", async (req, res) => {
  const { prompt, projectId } = req.body;
  if (!prompt) return res.status(400).json({ error: "Prompt is verplicht" });

  try {
    // Get project context/history to give the model context
    const context = await getProjectContext(projectId);

    // Decide whether to use light model first (fast edits) or heavy model (new feature)
    const preferLightModel = isSmallEdit(prompt);

    // Call AI with fallback
    const aiResult = await callAIWithFallback({ prompt, context, preferLightModel, apiKey: API_KEY });

    // The raw text from the AI
    let aiText = aiResult.text || "";

    // If AI returned markdown sections, clean it up
    let cleaned = cleanCode(aiText);

    // Self-correction loop: validate and ask AI to fix if invalid (max 2 correction attempts)
    let attempts = 0;
    while (attempts < 2) {
      attempts++;
      const check = validateCode(cleaned);
      if (check.valid) break;

      console.log(`Self-correction: detected problem (${check.reason}). Asking agent to fix (attempt ${attempts})`);
      // Ask the AI to fix only the broken HTML — include the broken code for context (but trimmed)
      const fixPrompt = `FIX DE VOLGENDE FOUT: ${check.reason}\n\nCODE:\n${cleaned}\n\nRETURN ONLY THE FIXED FULL HTML FILE.`;
      const fixResp = await callAIWithFallback({ prompt: fixPrompt, context: "", preferLightModel: false, apiKey: API_KEY });
      const fixedText = fixResp.text || "";
      cleaned = cleanCode(fixedText);
    }

    // If still invalid after corrections, include the last AI raw text in a safe HTML wrapper (so preview won't break)
    const finalCheck = validateCode(cleaned);
    let finalCode = cleaned;
    if (!finalCheck.valid) {
      console.warn("Final validation failed, returning safe fallback HTML with raw AI output inside.");
      finalCode = `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agent Output (Fallback)</title></head>
<body><pre style="white-space:pre-wrap;word-wrap:break-word;padding:20px;font-family:monospace;">${escapeHtml(aiText)}</pre></body>
</html>`;
    }

    // Save to Supabase (insert or update)
    let dbResult;
    if (projectId) {
      const { data, error } = await supabase
        .from("projects")
        .update({ code: finalCode, prompt, updated_at: new Date() })
        .eq("id", projectId)
        .select();
      if (error) throw error;
      dbResult = data;
    } else {
      const { data, error } = await supabase
        .from("projects")
        .insert([{ name: prompt.substring(0, 40), code: finalCode, prompt }])
        .select();
      if (error) throw error;
      dbResult = data;
    }

    const saved = dbResult?.[0];
    res.json({ code: finalCode, projectId: saved?.id || null, modelUsed: aiResult.modelUsed });
  } catch (err) {
    console.error("Generate error:", err?.response?.data || err.message || err);
    const msg = err?.response?.data?.error?.message || err?.message || "Onbekende fout";
    res.status(500).json({ error: "AGENT ERROR: " + msg });
  }
});

// Health check
app.get("/", (req, res) => res.send({ status: "Kavrix Engine OK" }));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kavrix Engine listening on ${PORT}`));
