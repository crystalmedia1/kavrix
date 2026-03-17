// DEBUG endpoints - voeg toe in server.js
app.get("/ping", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get("/debug-fetch", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "url param missing" });
  try {
    const proxy = "https://api.allorigins.win/raw?url=" + encodeURIComponent(url);
    const r = await axios.get(proxy, { timeout: 15000 });
    // Stuur alleen eerste 1000 chars en length terug om grootte problemen te tonen
    res.json({ status: r.status, length: r.data.length, head: String(r.data).slice(0,1000) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/debug-ai", async (req, res) => {
  try {
    const testPrompt = "Stuur alleen 'OK' als antwoord (test).";
    const r = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "system", content: "Je bent test." }, { role: "user", content: testPrompt}],
      temperature: 0.0
    }, {
      headers: { Authorization: `Bearer ${process.env.API_KEY}`, "Content-Type": "application/json" }
    });
    // Geef korte metadata terug (geen keys)
    res.json({ status: "ok", model: r.data.model || "unknown", sample: String(r.data.choices?.[0]?.message?.content || "").slice(0,200) });
  } catch (e) {
    res.status(500).json({ error: e.response?.data || e.message });
  }
});
