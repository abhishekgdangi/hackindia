/**
 * agents/classificationAgent.js
 *
 * Uses Groq (FREE API) with Llama 3.3 70B to classify hackathons.
 *
 * Groq Free Tier:
 *   - 14,400 requests / day
 *   - 500,000 tokens / minute
 *   - No credit card required
 *   - Sign up: https://console.groq.com
 *
 * Classifies: domains, level, isFeatured, qualityScore, improved summary.
 * Runs in batches of 8 to keep prompt size small.
 */

const Groq   = require("groq-sdk");
const logger = require("../utils/logger");

// Lazy-initialise so the app starts even if GROQ_API_KEY is not set yet
let groqClient = null;
function getClient() {
  if (!groqClient) {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error("GROQ_API_KEY not set in .env");
    groqClient = new Groq({ apiKey: key });
  }
  return groqClient;
}

const MODEL       = () => process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const BATCH_SIZE  = 8;   // hackathons per single Groq call

const DOMAINS = [
  "AI/ML", "Web Dev", "Blockchain", "Cybersecurity",
  "Data Science", "Cloud", "Mobile Apps", "IoT",
  "AR/VR", "Robotics", "Open Source", "FinTech",
  "HealthTech", "EdTech", "CleanTech", "GameDev",
];

const LEVELS = ["College", "City", "Regional", "National", "International", "Global"];

/**
 * classifyBatch(hackathons[])
 * Returns array of enrichment objects (same length as input).
 */
async function classifyBatch(hackathons) {
  if (!hackathons.length) return [];

  const prompt = `You are an expert hackathon classifier. Classify each hackathon and return ONLY a JSON array — no markdown, no explanation.

Available domains: ${DOMAINS.join(", ")}
Available levels: ${LEVELS.join(", ")}

For each hackathon, return an object with:
- "domains": string[] — top 3-5 matching domains from the list above
- "level": string — one level from the list above
- "qualityScore": integer 1-100 (based on prize amount, organizer credibility, reach)
- "summary": string — improved 1-sentence description (max 120 chars)
- "isFeatured": boolean — true if prize > ₹2,00,000 or organizer is well-known (Google, Microsoft, IIT, etc.)

Input hackathons:
${hackathons.map((h, i) => `[${i}] Name: "${h.name}" | Org: "${h.organizer||"?"}" | Prize: "${h.prize||"?"}" | City: "${h.city}" | Mode: "${h.mode}" | Desc: "${(h.description||"").slice(0,150)}" | Tags: [${(h.domains||[]).join(", ")}]`).join("\n")}

Respond with EXACTLY a JSON array of ${hackathons.length} objects. Nothing else.`;

  try {
    const client = getClient();
    const res    = await client.chat.completions.create({
      model:       MODEL(),
      messages:    [{ role: "user", content: prompt }],
      max_tokens:  1200,
      temperature: 0.1,   // low temperature for consistent structured output
    });

    const raw     = res.choices[0]?.message?.content || "[]";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed  = JSON.parse(cleaned);

    if (!Array.isArray(parsed) || parsed.length !== hackathons.length) {
      throw new Error(`Expected ${hackathons.length} items, got ${parsed.length}`);
    }
    return parsed;

  } catch (e) {
    logger.error(`[ClassificationAgent] Groq call failed: ${e.message}`);
    // Return safe defaults on failure — don't crash the pipeline
    return hackathons.map(() => ({
      domains:      [],
      level:        "Unknown",
      qualityScore: 50,
      summary:      "",
      isFeatured:   false,
    }));
  }
}

/**
 * classifyAll(hackathons[])
 * Process any-size array by chunking into BATCH_SIZE.
 */
async function classifyAll(hackathons) {
  if (!hackathons.length) return [];

  // Skip classification if no API key
  if (!process.env.GROQ_API_KEY) {
    logger.warn("[ClassificationAgent] GROQ_API_KEY not set — skipping AI classification");
    return hackathons;
  }

  const enriched = [];

  for (let i = 0; i < hackathons.length; i += BATCH_SIZE) {
    const batch      = hackathons.slice(i, i + BATCH_SIZE);
    const classified = await classifyBatch(batch);

    for (let j = 0; j < batch.length; j++) {
      const cl = classified[j] || {};
      enriched.push({
        ...batch[j],
        domains:      cl.domains?.length > 0 ? cl.domains : (batch[j].domains || []),
        level:        cl.level    || batch[j].level || "Unknown",
        isFeatured:   Boolean(cl.isFeatured),
        description:  cl.summary  || batch[j].description || "",
        qualityScore: cl.qualityScore || 50,
      });
    }

    logger.info(
      `[ClassificationAgent] Classified ${Math.min(i + BATCH_SIZE, hackathons.length)}/${hackathons.length}`
    );

    // Respect Groq rate limit — small pause between batches
    if (i + BATCH_SIZE < hackathons.length) {
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  return enriched;
}

module.exports = { classifyAll, classifyBatch };
