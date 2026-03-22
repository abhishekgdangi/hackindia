/**
 * routes/dsa.js
 * DSA Tool — AI tip generation via Groq pool (multi-key rotation)
 * POST /api/dsa/topics/:slug/tip
 */
const express    = require("express");
const router     = express.Router();
const logger     = require("../utils/logger");
const { groqCall } = require("../utils/groqPool");

const tipCache = {};

router.post("/topics/:slug/tip", async (req, res) => {
  const { slug } = req.params;

  if (tipCache[slug]) {
    return res.json({ tip: tipCache[slug], cached: true });
  }

  const TOPICS = {
    "arrays":"Arrays","binary-search":"Binary Search","two-pointers":"Two Pointers",
    "sliding-window":"Sliding Window","linked-list":"Linked List","stack-queue":"Stack & Queue",
    "binary-trees":"Binary Trees","graphs":"Graphs","dynamic-programming":"Dynamic Programming",
    "greedy":"Greedy","recursion":"Recursion","heaps":"Heaps","bst":"BST",
    "tries":"Tries","bit-manipulation":"Bit Manipulation","string-algorithms":"String Algorithms",
  };
  const topic = TOPICS[slug] || slug;

  if (!process.env.GROQ_API_KEY) {
    return res.json({ tip: `💡 Study tip for ${topic}:\n\n• Start with the fundamentals — understand core operations and time complexity\n• Practice 10-15 problems from easy to medium before attempting hard\n• Focus on recognizing patterns rather than memorizing solutions\n\n(Add GROQ_API_KEY to .env for AI-powered tips)` });
  }

  try {
    const completion = await groqCall({
      model:      "llama-3.3-70b-versatile",
      max_tokens: 350,
      messages: [
        {
          role:    "system",
          content: "You are a DSA coach for Indian students targeting placements at product companies (Flipkart, Amazon India, Google India, Swiggy, Zepto, etc.). Give exactly 3 bullet points — each 1-2 sentences. Be direct and practical. No fluff. Use • for bullets.",
        },
        {
          role:    "user",
          content: `Give me a 3-point study strategy for mastering ${topic} in DSA for Indian product company placements.`,
        },
      ],
    });

    const tip = completion.choices?.[0]?.message?.content || "Could not generate tip.";
    tipCache[slug] = tip;
    res.json({ tip });
  } catch (err) {
    logger.error(`DSA tip error: ${err.message}`);
    if (err.status === 429) {
      return res.status(429).json({ tip: "AI is busy — please wait 30 seconds and try again." });
    }
    res.status(500).json({ tip: "Could not generate tip. Check GROQ_API_KEY." });
  }
});

router.get("/health", (_req, res) => res.json({ status: "ok" }));

module.exports = router;
