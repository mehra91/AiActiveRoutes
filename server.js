// ============================================
// AI Active Routes — Express Backend
// ============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { generateContent } = require('./services/providers');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static('frontend'));

// ─── Routes ───────────────────────────────

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/index.html'));
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Server is running!',
    providers: {
      gemini: !!process.env.GEMINI_API_KEY,
      huggingFace: !!process.env.HF_TOKEN,
      llama: !!process.env.LLMA_API_KEY,
      groq: !!process.env.GROQ_API_KEY,
      deepseek: !!process.env.DEEPSEEK_API_KEY,
      cohere: !!process.env.COHERE_API_KEY,
      cerebras: !!process.env.CEREBRAS_API_KEY,
      mistral: !!process.env.MISTRAL_API_KEY
    }
  });
});

// Main API endpoint
app.post('/api/generate', async (req, res) => {
  const { topic, category, provider } = req.body;

  if (!topic || !category || !provider) {
    return res.status(400).json({ error: 'Missing topic, category, or provider' });
  }

  try {
    const result = await generateContent({ topic, category, provider });

    res.json({
      success: true,
      provider,
      topic,
      category,
      result
    });
  } catch (err) {
    console.error(`[${provider}] generation error:`, err.message);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to generate content'
    });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/api/health\n`);
});