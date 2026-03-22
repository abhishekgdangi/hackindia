/**
 * utils/groqPool.js
 * Multi-key Groq pool — round-robin rotation + 429 cooldown
 *
 * Keys in .env:
 *   GROQ_API_KEY      → key 1 (existing)
 *   GROQ_API_KEY_2    → key 2
 *   GROQ_API_KEY_3    → key 3
 *   ...up to GROQ_API_KEY_10
 */

const Groq = require("groq-sdk");

function loadKeys() {
  const keys = [];
  if (process.env.GROQ_API_KEY) keys.push(process.env.GROQ_API_KEY);
  for (let i = 2; i <= 10; i++) {
    const k = process.env[`GROQ_API_KEY_${i}`];
    if (k) keys.push(k);
  }
  if (!keys.length) throw new Error("No GROQ_API_KEY found in environment.");
  return keys;
}

const CLIENTS = loadKeys().map(k => ({
  client:    new Groq({ apiKey: k }),
  keyHint:   k.slice(-6),
  coolUntil: 0,
  requests:  0,
}));

let robin = 0;

function getClient() {
  const now = Date.now();
  for (let i = 0; i < CLIENTS.length; i++) {
    const entry = CLIENTS[robin % CLIENTS.length];
    robin++;
    if (entry.coolUntil <= now) return entry;
  }
  const soonest  = Math.min(...CLIENTS.map(c => c.coolUntil));
  const waitSec  = Math.ceil((soonest - now) / 1000);
  const err      = new Error(`All Groq API keys are rate-limited. Retry in ${waitSec}s.`);
  err.status     = 429;
  err.retryAfter = waitSec;
  throw err;
}

async function groqCall(params, retries) {
  retries = retries || CLIENTS.length;
  let lastErr;
  for (let i = 0; i < retries; i++) {
    const entry = getClient();
    try {
      entry.requests++;
      return await entry.client.chat.completions.create(params);
    } catch (err) {
      lastErr = err;
      const status = err.status || err.response?.status;
      if (status === 429) {
        entry.coolUntil = Date.now() + 60000;
        try { require("./logger").warn(`[GroqPool] Key ...${entry.keyHint} rate-limited — cooling 60s`); } catch(_) {}
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function poolStatus() {
  const now = Date.now();
  return {
    total_keys: CLIENTS.length,
    available:  CLIENTS.filter(c => c.coolUntil <= now).length,
    keys: CLIENTS.map(c => ({
      hint:     `...${c.keyHint}`,
      status:   c.coolUntil > now ? `cooling ${Math.ceil((c.coolUntil-now)/1000)}s` : "ready",
      requests: c.requests,
    })),
  };
}

module.exports = { groqCall, poolStatus, keyCount: CLIENTS.length };
