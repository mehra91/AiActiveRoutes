// ============================================
// AI Provider Service
// Routes a generation request to the correct AI provider
// based on req.body.provider, using topic + category to
// build the prompt.
// ============================================

/**
 * Build a consistent prompt from topic + category.
 * Asks the model to respond with a strict JSON array of 4 objects so every
 * provider returns the same [{ title, content, conclusion }, ...] shape.
 */
function buildPrompt(topic, category) {
  return (
    
        `Generate exactly 4 distinct pieces of content about "${topic}" in the "${category}" category.\n\n` +
        `Return ONLY a valid JSON array with exactly 4 objects. Each object MUST have these exact fields:\n` +
        `- "title": engaging title\n` +
        `- "content": 300+ words of detailed content with multiple paragraphs\n` +
        `- "conclusion": concluding paragraph\n\n` +
        `Return ONLY the JSON array, nothing else:\n` +
        `[` +
          `{"title":"...", "content":"...", "conclusion":"..."}, ` +
          `{"title":"...", "content":"...", "conclusion":"..."}, ` +
          `{"title":"...", "content":"...", "conclusion":"..."}, ` +
          `{"title":"...", "content":"...", "conclusion":"..."}` +
        `]`
    
  );
}

/**
 * Main entry point — routes to the correct provider handler.
 * Throws an Error with a useful message if the provider is unknown
 * or the call fails.
 */
async function generateContent({ topic, category, provider }) {
  const key = String(provider).toLowerCase().trim();
  const handler = PROVIDER_HANDLERS[key];

  if (!handler) {
    const supported = Object.keys(PROVIDER_HANDLERS).join(', ');
    throw new Error(`Unsupported provider: "${provider}". Supported: ${supported}`);
  }

  const prompt = buildPrompt(topic, category);
  const rawResult = await handler(prompt);
  return parseStructuredResponse(rawResult);
}

/**
 * Parse a provider's raw text response into an array of
 * { title, content, conclusion } items (target: 4 items).
 *
 * 1. Try to find and JSON.parse a [...] array in the response
 *    (handles models that wrap JSON in ```json fences or add stray text).
 * 2. If that yields a single {...} object instead (or an object that
 *    wraps the array under a key like "results"/"items"/"posts"), handle that too.
 * 3. If JSON parsing fails entirely, fall back to splitting markdown-style
 *    text into multiple sections (looking for "---" separators, numbered
 *    headings, or repeated "**Title:**" / "**Conclusion**" blocks) so the
 *    response is still usable even if a model ignores the JSON instruction.
 */
function parseStructuredResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    console.log("No raw text");
    return [];
  }

  const text = rawText.trim();
  console.log("First 100 chars:", text.substring(0, 100));

  // Strip ```json ... ``` or ``` ... ``` code fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const unfenced = fenced ? fenced[1].trim() : text;

  // 1. Try a JSON array first
  const arrayMatch = unfenced.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed) && parsed.length) {
        console.log("SUCCESS: Parsed JSON array with", parsed.length, "items");
        return parsed.map(normalizeItem);
      }
    } catch (e) {
      console.error("JSON parse error:", e.message);
    }
  }

  // 2. Try a single JSON object
  const objectMatch = unfenced.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      const parsed = JSON.parse(objectMatch[0]);
      const wrapped =
        parsed.results || parsed.items || parsed.posts || parsed.blogs || parsed.data;

      if (Array.isArray(wrapped) && wrapped.length) {
        console.log(" Wrapped array found");
        return wrapped.map(normalizeItem);
      }
      if (parsed.title || parsed.content) {
        console.log(" Single object found");
        return [normalizeItem(parsed)];
      }
    } catch (e) {
      console.error("JSON object parse error:", e.message);
    }
  }

  console.log(" FALLING BACK to markdown extraction");
  return extractItemsFromMarkdown(text);
}

/**
 * Normalize a single parsed JSON item to the { title, content, conclusion } shape.
 */
function normalizeItem(item) {
  console.log("normalizeItem called with:", item.title);
  return {
    title: String(item?.title ?? '').trim(),
    content: String(item?.content ?? '').trim(),
    
    conclusion: String(item?.conclusion ?? '').trim()
  };
}

// Fallback: split the full markdown text into 4 separate chunks,
// then extract title/content/conclusion from each chunk.
function extractItemsFromMarkdown(text) {
  let chunks = [];

  // Step 1: try splitting by "---" dividers (most common separator models use)
  chunks = text.split(/\n---+\n/).map(c => c.trim()).filter(Boolean);

  // Step 2: if no dividers found, split by lines that start with a number like "1." or "2."
  if (chunks.length <= 1) {
    chunks = text.split(/\n(?=\d+\.\s)/).map(c => c.trim()).filter(Boolean);
  }

  // Step 3: if still nothing, split by lines that start with "## " headings
  if (chunks.length <= 1) {
    chunks = text.split(/\n(?=##\s)/).map(c => c.trim()).filter(Boolean);
  }

  // Step 4: if all else fails, treat the whole text as one single item
  if (chunks.length === 0) {
    chunks = [text];
  }

  return chunks.map(extractSingleFromMarkdown);
}

// Pull out title, content, and conclusion from one markdown chunk.
function extractSingleFromMarkdown(text) {
  let title = '';
  let content = text;
  let conclusion = '';

  // Find the title — look for "**Title:** ..." or "## Heading" at the top
  const titleMatch = text.match(/(?:\*\*Title\*\*:?\s*|##\s*)(.+)/i);
  if (titleMatch) {
    title = titleMatch[1].replace(/\*\*/g, '').trim();
    content = content.replace(titleMatch[0], '').trim();
  }

  

  // Find the conclusion — look for "**Conclusion**" and grab everything after it
  const conclusionMatch = content.match(/\*\*Conclusion\*\*:?\s*([\s\S]+?)$/i);
  if (conclusionMatch) {
    conclusion = conclusionMatch[1].trim();
    content = content.slice(0, conclusionMatch.index).trim();
  }

  return { title, content, conclusion };

}

// ─── Groq ────────────────────────────────────────────────────
async function callGroq(prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set in .env');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4096
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'Groq API request failed');
  }

  return data.choices?.[0]?.message?.content?.trim() || 'No response from Groq';
}


// ─── Cohere ──────────────────────────────────────────────────
async function callCohere(prompt) {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) throw new Error('COHERE_API_KEY is not set in .env');

  const response = await fetch('https://api.cohere.ai/v1/chat', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      model: 'command-a-03-2025',
      // preamble = system prompt in Cohere v1; forces strict JSON-only output
      preamble:
        'You are a JSON-only content generator. ' +
        'You MUST respond with a raw JSON array containing exactly 4 objects. ' +
        'Each object must have exactly these three keys: "title", "content", "conclusion". ' +
        'Do NOT include any text, explanation, markdown, or code fences outside the JSON array. ' +
        'Your entire response must start with [ and end with ].',
      message: prompt,
      max_tokens: 4096,
      temperature: 0.3   // lower = more deterministic, stays on the JSON format
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Cohere API request failed');
  }

  // Cohere v1/chat response shape: { text: "..." }
  return data.text?.trim() || 'No response from Cohere';
}


// Map provider names (as sent by the frontend) to handlers.
// Multiple aliases are supported so the frontend naming is flexible.


// ─── Cerebras ─────────────────────────────────────────────────
async function callCerebras(prompt) {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) throw new Error('CEREBRAS_API_KEY is not set in .env');

  const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-oss-120b',   // current Cerebras flagship model
      messages: [{ role: 'user', content: prompt }],
      max_completion_tokens: 4096,  // Cerebras uses max_completion_tokens, not max_tokens
      temperature: 0.3
    })
  });

  const data = await response.json();

  if (!response.ok) {
    // Log full error detail so you can see exactly what Cerebras returns
    const detail = data.error?.message || data.message || JSON.stringify(data);
    throw new Error(`Cerebras error: ${detail}`);
  }

  return data.choices?.[0]?.message?.content?.trim() || 'No response from Cerebras';
}

// ─── Mistral ──────────────────────────────────────────────────
async function callMistral(prompt) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('MISTRAL_API_KEY is not set in .env');

  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'mistral-large-latest',  // best instruction-following model on Mistral
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4096,
      temperature: 0.3
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || data.message || 'Mistral API request failed');
  }

  // Same OpenAI-style response shape: choices[0].message.content
  return data.choices?.[0]?.message?.content?.trim() || 'No response from Mistral';
}

const PROVIDER_HANDLERS = {
  groq: callGroq,
  grok: callGroq,
  cohere: callCohere,
  cerebras: callCerebras,
  mistral: callMistral
};

module.exports = { generateContent };