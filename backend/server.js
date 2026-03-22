/**
 * server.js
 * HackIndia Express API server.
 * Connects to MongoDB, registers all routes, starts cron jobs.
 */

require("dotenv").config();

const express   = require("express");
const mongoose  = require("mongoose");
const cors      = require("cors");
const helmet    = require("helmet");
const rateLimit = require("express-rate-limit");
const logger    = require("./utils/logger");
const { groqCall, poolStatus } = require("./utils/groqPool");
const { registerJobs, triggerNow } = require("./jobs/scheduler");
const Hackathon = require("./models/Hackathon");

const app  = express();
const PORT = process.env.PORT || 5000;

/* ── Security ──────────────────────────────────────────────────── */
app.use(helmet({ crossOriginEmbedderPolicy: false }));

app.use(cors({ origin: true, credentials: true }));

app.use(
  "/api/",
  rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 min
    max: 300,
    standardHeaders: true,
    message: { error: "Too many requests, please slow down." },
  })
);

/* ── Body parsing ──────────────────────────────────────────────── */
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

/* ── Request logger ────────────────────────────────────────────── */
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

/* ── Routes ────────────────────────────────────────────────────── */
app.use("/api/dsa",         require("./routes/dsa"));
app.use("/api/hackathons",  require("./routes/hackathons"));
app.use("/api/internships", require("./routes/internships"));
app.use("/api/events",      require("./routes/events"));
app.use("/api/resume",      require("./routes/resume"));

/* ── HackBot Chat (Groq proxy — key stays on server) ───────────── */
app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array required" });
    }
    const completion = await groqCall({
      model:      "llama-3.3-70b-versatile",
      max_tokens: 600,
      messages,
    });
    const reply = completion.choices?.[0]?.message?.content || "Sorry, no response.";
    res.json({ reply });
  } catch (err) {
    logger.error(`[Chat] ${err.message}`);
    if (err.status === 429) return res.status(429).json({ error: "AI is busy — please wait 30 seconds." });
    res.status(500).json({ error: "Chat failed. Try again." });
  }
});

/* ── Health endpoint ───────────────────────────────────────────── */
app.get("/api/health", async (_req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbLabel = ["disconnected","connected","connecting","disconnecting"][dbState] || "unknown";
  const open    = await Hackathon
    .countDocuments({ status: "OPEN", isActive: true })
    .catch(() => 0);

  res.json({
    status:         "ok",
    db:             dbLabel,
    openHackathons: open,
    uptime:         Math.round(process.uptime()),
    env:            process.env.NODE_ENV || "development",
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    groqPool:       poolStatus(),
  });
});

/* ── Agent status endpoint ─────────────────────────────────────── */
app.get("/api/agent-status", async (_req, res) => {
  try {
    const AgentLog = require("./models/AgentLog");
    const logs     = await AgentLog
      .find()
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── 404 ───────────────────────────────────────────────────────── */
app.use((req, res) =>
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` })
);

/* ── Error handler ─────────────────────────────────────────────── */
app.use((err, _req, res, _next) => {
  logger.error(`Unhandled error: ${err.message}`);
  res.status(500).json({ error: "Internal server error" });
});

/* ── Boot ──────────────────────────────────────────────────────── */
async function start() {
  const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/hackindia";

  // Retry MongoDB connection — don't crash on cold start timeout
  let mongoConnected = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 15000,
        socketTimeoutMS:          60000,
      });
      logger.info(`✅ MongoDB connected: ${MONGO_URI.replace(/\/\/.*@/, "//***@")}`);
      mongoConnected = true;
      break;
    } catch (err) {
      logger.error(`❌ MongoDB attempt ${attempt}/5 failed: ${err.message}`);
      if (attempt < 5) {
        logger.info(`   Retrying in 3s...`);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }
  if (!mongoConnected) {
    logger.error("   → All MongoDB connection attempts failed. Starting without DB.");
    // Don't exit — let Render keep the process alive for health checks
  }

  app.listen(PORT, () => {
    logger.info(`✅ HackIndia API running at http://localhost:${PORT}`);
    logger.info(`   Environment  : ${process.env.NODE_ENV || "development"}`);
    logger.info(`   Groq AI      : ${process.env.GROQ_API_KEY ? "configured ✔" : "not set ✘ (add GROQ_API_KEY to .env)"}`);
  });

  // Register cron jobs
  registerJobs();

  // Auto-trigger pipeline if DB is empty
  const count = await Hackathon.countDocuments({ status: "OPEN" });
    // Auto-scrape on empty DB disabled — GitHub Actions handles scraping every 6h
   logger.info(`DB has ${count} open hackathons`);
}
/* ── Graceful shutdown ─────────────────────────────────────────── */
process.on("SIGTERM", async () => {
  logger.info("SIGTERM — shutting down gracefully…");
  await mongoose.disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT — shutting down…");
  await mongoose.disconnect();
  process.exit(0);
});

process.on("unhandledRejection", (reason) => {
  logger.error(`Unhandled rejection: ${reason}`);
});

start();
