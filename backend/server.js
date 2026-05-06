/**
 * server.js — Express Backend for AI Study Assistant
 *
 * Uses NVIDIA NIM APIs with dual-model architecture:
 *   Primary:  deepseek-v4-flash         (fast, optimized for technical MCQs)
 *   Fallback: llama-3.3-nemotron-super-49b-v1  (robust, broader knowledge)
 *
 * Includes in-memory caching, timeout/abort handling, automatic fallback,
 * CORS, rate limiting, and environment validation.
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

// ===== Environment Validation =====
const REQUIRED_ENV = ['NVIDIA_API_KEY'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌ Missing required environment variable: ${key}`);
    console.error('   Copy .env.example to .env and fill in your values.');
    process.exit(1);
  }
}

const PORT           = process.env.PORT || 3000;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_BASE_URL= process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const PRIMARY_MODEL  = process.env.PRIMARY_MODEL   || 'deepseek-ai/deepseek-v4-flash';
const FALLBACK_MODEL = process.env.FALLBACK_MODEL   || 'nvidia/llama-3.3-nemotron-super-49b-v1';

// Request timeout in milliseconds (15 seconds)
const REQUEST_TIMEOUT_MS = 15000;

// ===== In-Memory Answer Cache =====
// Maps a question-fingerprint → { answers, timestamp }
// Entries expire after 10 minutes to keep memory bounded.
const answerCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Build a deterministic cache key from the questions array.
 * Uses a simple hash of the sorted question texts + options.
 */
function cacheKey(questions) {
  const raw = questions.map(q => {
    const opts = (q.options || []).slice().sort().join('|');
    return `${q.question.trim().toLowerCase()}::${opts}`;
  }).join('###');
  // Simple djb2-style hash to keep keys short
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) & 0xffffffff;
  }
  return `qcache_${hash.toString(36)}`;
}

/**
 * Evict expired cache entries (called lazily)
 */
function evictStaleCache() {
  const now = Date.now();
  for (const [key, entry] of answerCache) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      answerCache.delete(key);
    }
  }
}

// ===== NVIDIA NIM API Helper =====

/**
 * Send a chat-completion request to NVIDIA NIM.
 *
 * @param {Array} messages  - OpenAI-compatible messages array
 * @param {string} model    - Model identifier (e.g. deepseek-v4-flash)
 * @returns {string}        - The assistant's reply text
 * @throws on network/timeout/API errors
 */
async function generateAnswer(messages, model) {
  // AbortController for timeout enforcement
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NVIDIA_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        max_tokens: 2000
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // ---- Handle HTTP-level errors ----
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      if (response.status === 401) throw new Error('INVALID_API_KEY');
      if (response.status === 429) throw new Error('RATE_LIMITED');
      throw new Error(`NVIDIA_API_ERROR_${response.status}: ${errorBody.substring(0, 200)}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    // ---- Handle empty / missing content ----
    if (!content || content.trim().length === 0) {
      throw new Error('EMPTY_RESPONSE');
    }

    return content;

  } catch (err) {
    clearTimeout(timeoutId);

    // Translate AbortError into a recognizable timeout error
    if (err.name === 'AbortError') {
      throw new Error('TIMEOUT');
    }
    throw err;
  }
}

/**
 * Try the primary model, fall back to the secondary on any failure.
 * Returns { text, modelUsed }.
 */
async function generateWithFallback(messages) {
  try {
    const text = await generateAnswer(messages, PRIMARY_MODEL);
    return { text, modelUsed: PRIMARY_MODEL };
  } catch (primaryErr) {
    console.warn(`⚠  Primary model (${PRIMARY_MODEL}) failed: ${primaryErr.message}`);
    console.warn(`   → Switching to fallback model (${FALLBACK_MODEL})...`);

    try {
      const text = await generateAnswer(messages, FALLBACK_MODEL);
      return { text, modelUsed: FALLBACK_MODEL };
    } catch (fallbackErr) {
      console.error(`❌ Fallback model (${FALLBACK_MODEL}) also failed: ${fallbackErr.message}`);
      throw fallbackErr; // both models down — propagate
    }
  }
}

// ===== Express Setup =====
const app = express();

// CORS — allow requests from Chrome extension
app.use(cors({
  origin: '*',
  methods: ['POST', 'GET'],
  allowedHeaders: ['Content-Type']
}));

// JSON body parser with error handling for malformed JSON
app.use(express.json({ limit: '50kb' }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    console.error('🔴 [REQ] Malformed JSON in request body');
    return res.status(400).json({ error: 'Invalid JSON in request body.' });
  }
  next(err);
});

// Rate limiting — 30 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', limiter);

// ===== Request Logger Middleware =====
app.use((req, res, next) => {
  const ts = new Date().toISOString().substring(11, 19);
  console.log(`📨 [${ts}] ${req.method} ${req.path}`);
  next();
});

// ===== Health Check =====
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'AI Study Assistant Backend',
    version: '2.1.0',
    primaryModel: PRIMARY_MODEL,
    fallbackModel: FALLBACK_MODEL,
    cacheSize: answerCache.size,
    uptime: Math.floor(process.uptime()) + 's'
  });
});

// ===== AI Connectivity Test: GET /test-ai =====
// Sends a tiny prompt to NVIDIA NIM to verify the API key and model connectivity.
app.get('/test-ai', async (req, res) => {
  console.log('🧪 [TEST] Running AI connectivity test...');
  const testMessages = [
    { role: 'system', content: 'Reply with exactly: {"test":"ok"}' },
    { role: 'user', content: 'ping' }
  ];

  const results = { primary: null, fallback: null };

  // Test primary model
  try {
    console.log(`🧪 [TEST] Testing primary: ${PRIMARY_MODEL}`);
    const start = Date.now();
    const text = await generateAnswer(testMessages, PRIMARY_MODEL);
    const ms = Date.now() - start;
    results.primary = { status: 'ok', model: PRIMARY_MODEL, latency: ms + 'ms', response: text.substring(0, 100) };
    console.log(`✅ [TEST] Primary OK (${ms}ms)`);
  } catch (err) {
    results.primary = { status: 'error', model: PRIMARY_MODEL, error: err.message };
    console.warn(`❌ [TEST] Primary failed: ${err.message}`);
  }

  // Test fallback model
  try {
    console.log(`🧪 [TEST] Testing fallback: ${FALLBACK_MODEL}`);
    const start = Date.now();
    const text = await generateAnswer(testMessages, FALLBACK_MODEL);
    const ms = Date.now() - start;
    results.fallback = { status: 'ok', model: FALLBACK_MODEL, latency: ms + 'ms', response: text.substring(0, 100) };
    console.log(`✅ [TEST] Fallback OK (${ms}ms)`);
  } catch (err) {
    results.fallback = { status: 'error', model: FALLBACK_MODEL, error: err.message };
    console.warn(`❌ [TEST] Fallback failed: ${err.message}`);
  }

  const overallOk = results.primary?.status === 'ok' || results.fallback?.status === 'ok';
  res.status(overallOk ? 200 : 503).json({
    status: overallOk ? 'ok' : 'error',
    message: overallOk ? 'At least one model is reachable' : 'Both models unreachable',
    ...results
  });
});

// ===== Main Endpoint: POST /api/answers =====
app.post('/api/answers', async (req, res) => {
  try {
    const { questions } = req.body;

    // Validate input — missing or wrong type
    if (!req.body || typeof req.body !== 'object') {
      console.warn('🔴 [VAL] Empty or non-object request body');
      return res.status(400).json({ error: 'Request body must be a JSON object.' });
    }
    if (!questions) {
      console.warn('🔴 [VAL] Missing "questions" field');
      return res.status(400).json({ error: 'Missing required field: "questions".' });
    }
    if (!Array.isArray(questions)) {
      console.warn('🔴 [VAL] "questions" is not an array');
      return res.status(400).json({ error: '"questions" must be an array.' });
    }
    if (questions.length === 0) {
      console.warn('🔴 [VAL] "questions" array is empty');
      return res.status(400).json({ error: '"questions" array must not be empty.' });
    }

    // Limit to 15 questions max
    const limitedQuestions = questions.slice(0, 15);
    console.log(`📝 [API] Received ${questions.length} questions (processing ${limitedQuestions.length})`);

    // ---- Check cache first ----
    evictStaleCache();
    const key = cacheKey(limitedQuestions);
    if (answerCache.has(key)) {
      console.log('📦 [CACHE] Hit — returning cached answers');
      const cached = answerCache.get(key);
      return res.json({ answers: cached.answers, modelUsed: cached.modelUsed + ' (cached)' });
    }

    // ---- Deduplicate questions ----
    // Some pages emit the same question multiple times; collapse them to save tokens.
    const uniqueMap = new Map();
    const indexMap = []; // maps original index → deduplicated index
    limitedQuestions.forEach((q, i) => {
      const normKey = q.question.trim().toLowerCase();
      if (uniqueMap.has(normKey)) {
        indexMap[i] = uniqueMap.get(normKey).dedupeIdx;
      } else {
        const dedupeIdx = uniqueMap.size;
        uniqueMap.set(normKey, { dedupeIdx, question: q });
        indexMap[i] = dedupeIdx;
      }
    });
    const dedupedQuestions = Array.from(uniqueMap.values()).map(v => v.question);

    // ---- Build messages for NVIDIA NIM ----
    const messages = buildMessages(dedupedQuestions);

    // ---- Call NVIDIA NIM with automatic fallback ----
    const { text: rawContent, modelUsed } = await generateWithFallback(messages);

    // ---- Parse the AI response ----
    let parsed;
    try {
      // The model may wrap JSON in markdown fences; strip them.
      const cleaned = rawContent.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('Failed to parse AI response:', rawContent.substring(0, 300));
      return res.status(500).json({ error: 'Failed to parse AI response.' });
    }

    // ---- Normalize & expand back to original question count ----
    const dedupedAnswers = normalizeAnswers(parsed, dedupedQuestions);
    const answers = limitedQuestions.map((_, i) => dedupedAnswers[indexMap[i]] || { answer: 'No answer available', confidence: 'low' });

    // ---- Store in cache ----
    answerCache.set(key, { answers, modelUsed, timestamp: Date.now() });
    console.log(`✅ [API] Returned ${answers.length} answers via ${modelUsed}`);

    res.json({ answers, modelUsed });

  } catch (err) {
    console.error('API Error:', err.message);

    if (err.message === 'INVALID_API_KEY') {
      return res.status(500).json({ error: 'Invalid NVIDIA API key. Check your .env file.' });
    }
    if (err.message === 'RATE_LIMITED') {
      return res.status(429).json({ error: 'API rate limit reached. Try again shortly.' });
    }
    if (err.message === 'TIMEOUT') {
      return res.status(504).json({ error: 'Both models timed out. Try again later.' });
    }
    if (err.message === 'EMPTY_RESPONSE') {
      return res.status(502).json({ error: 'AI returned an empty response. Retry.' });
    }

    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ===== Prompt Builder =====

/**
 * Build the optimized quiz-answering messages array.
 * Uses a concise system prompt tuned for certification quizzes.
 */
function buildMessages(questions) {
  const formatted = questions.map((q, i) => {
    let text = `Question ${i + 1}: ${q.question}`;
    if (q.options && q.options.length > 0) {
      text += '\nOptions: ' + q.options.join(' | ');
    }
    return text;
  }).join('\n\n');

  return [
    {
      role: 'system',
      content:
        'You are solving online certification quiz questions.\n\n' +
        'Rules:\n' +
        '- Give concise answers only.\n' +
        '- If MCQ, return only the most likely option.\n' +
        '- If subjective, answer in 1-2 lines maximum.\n' +
        '- Be highly accurate and direct.\n' +
        '- Avoid unnecessary explanations.\n\n' +
        'Respond with ONLY a valid JSON object: { "answers": [ { "answer": "...", "confidence": "high|medium|low" } ] }'
    },
    {
      role: 'user',
      content: formatted
    }
  ];
}

/**
 * Normalize the AI response to ensure consistent format
 */
function normalizeAnswers(parsed, questions) {
  let answers = parsed.answers || [];

  return questions.map((q, i) => {
    if (answers[i]) {
      return {
        answer: String(answers[i].answer || answers[i].text || ''),
        confidence: answers[i].confidence || 'medium'
      };
    }
    return { answer: 'No answer available', confidence: 'low' };
  });
}

// ===== Start Server =====
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 AI Study Assistant Backend v2.0 running on port ${PORT}`);
  console.log(`   Primary model : ${PRIMARY_MODEL}`);
  console.log(`   Fallback model: ${FALLBACK_MODEL}`);
  console.log(`   Timeout       : ${REQUEST_TIMEOUT_MS / 1000}s`);
  console.log(`   Rate limit    : 30 req/min`);
  console.log(`   Cache TTL     : ${CACHE_TTL_MS / 1000}s\n`);
});
