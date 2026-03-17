require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL || 'https://qixbvlixyanoswsbucav.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'sb_publishable_wkhKyrhGyEN-ma8-DV61hw_Q47c98lB';
const supabase = createClient(supabaseUrl, supabaseKey);

// Helper functies
function sanitizePrompt(text) {
  if (!text) return '';
  return text
    .replace(/(username|user|password|pass)=[^&\s]+/gi, '$1=***')
    .replace(/https?:\/\/[^\s'"]+/gi, '[URL]')
    .replace(/IPTV/gi, 'HLS Media Player')
    .replace(/m3u/gi, 'stream playlist');
}

function cleanCode(text) {
  if (!text) return '';
  let code = text.trim();
  code = code.replace(/```html/g, '').replace(/```/g, '').trim();
  const start = code.indexOf('<!DOCTYPE html>');
  const end = code.lastIndexOf('</html>');
  if (start !== -1 && end !== -1) {
    code = code.substring(start, end + 7);
  }
  return code;
}

// AI Generate endpoint
app.post('/generate', async (req, res) => {
  try {
    const { prompt = '', existingCode = '' } = req.body;
    const safePrompt = sanitizePrompt(prompt);
    const shortExisting = existingCode ? existingCode.slice(0, 15000) : '';

    const API_KEY = process.env.ROUTELLM_KEY;
    if (!API_KEY) return res.status(500).json({ error: 'API key ontbreekt op server' });

    const body = {
      model: 'route-llm',
      input: [
        { role: 'system', content: 'Je bent een professionele webdeveloper. Geef alleen volledige HTML.' },
        {
          role: 'user',
          content: shortExisting
            ? `UPDATE DE CODE:\n${shortExisting}\n\nWIJZIG: ${safePrompt}`
            : `BOUW APP: ${safePrompt}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 8000,
    };

    const aiResp = await axios.post('https://routellm.abacus.ai/v1/chat/completions', body, {
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 45000,
    });

    const aiText = aiResp.data?.choices?.[0]?.message?.content || '';
    const html = cleanCode(aiText);

    if (!html) return res.status(500).json({ error: 'AI gaf geen HTML terug', debug: aiResp.data });

    res.json({ code: html });
  } catch (err) {
    console.error('generate error', err.response?.data || err.message);
    const status = err.response?.status || 500;
    const userMsg = status === 401 ? 'API key ongeldig' : status === 429 ? 'Rate limit, probeer opnieuw' : 'AI weigert of fout';
    res.status(500).json({ error: userMsg, details: err.response?.data });
  }
});

// Projecten opslaan
app.post('/projects', async (req, res) => {
  try {
    const { id, name, code, prompt } = req.body;
    if (id) {
      // Update bestaand project
      const { data, error } = await supabase
        .from('projects')
        .update({ name, code, prompt, updated_at: new Date().toISOString() })
        .eq('id', id)
        .single();
      if (error) throw error;
      res.json(data);
    } else {
      // Nieuw project aanmaken
      const { data, error } = await supabase
        .from('projects')
        .insert([{ name, code, prompt, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }])
        .single();
      if (error) throw error;
      res.json(data);
    }
  } catch (error) {
    console.error('project save error', error);
    res.status(500).json({ error: 'Kon project niet opslaan' });
  }
});

// Project ophalen
app.get('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase.from('projects').select('*').eq('id', id).single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('project load error', error);
    res.status(404).json({ error: 'Project niet gevonden' });
  }
});

// Serve frontend
app.use(express.static('public'));
app.get('/', (req, res) => res.sendFile('index.html', { root: 'public' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server draait op poort ${PORT}`));
