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
const { registerJobs, triggerNow } = require("./jobs/scheduler");
const Hackathon = require("./models/Hackathon");

const app  = express();
const PORT = process.env.PORT || 5000;

/* ── Security ──────────────────────────────────────────────────── */
app.use(helmet({ crossOriginEmbedderPolicy: false }));

const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:3000",
  /localhost/,
  /hackindia\.dev$/,
];
app.use(cors({ origin: allowedOrigins, credentials: true }));

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
app.use("/api/hackathons",  require("./routes/hackathons"));
app.use("/api/internships", require("./routes/internships"));

/* ── HackBot Chat (Groq proxy — key stays on server) ───────────── */
app.post("/api/chat", async (req, res) => {
  try {
    const axios    = require("axios");
    const { messages } = req.body;
    const groqKey  = process.env.GROQ_API_KEY;

    if (!groqKey) {
      return res.status(503).json({ error: "Groq API key not configured on server." });
    }
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array required" });
    }

    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      { model: "llama-3.3-70b-versatile", max_tokens: 600, messages },
      { headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` } }
    );

    const reply = response.data?.choices?.[0]?.message?.content || "Sorry, no response.";
    res.json({ reply });
  } catch (err) {
    logger.error(`[Chat] ${err.message}`);
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

  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS:          45000,
    });
    logger.info(`✅ MongoDB connected: ${MONGO_URI.replace(/\/\/.*@/, "//***@")}`);
  } catch (err) {
    logger.error(`❌ MongoDB connection failed: ${err.message}`);
    logger.error("   → Make sure MongoDB is running: sudo systemctl start mongod");
    process.exit(1);
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
  if (count === 0) {
    logger.info("DB is empty — running first scrape in 3 seconds…");
    setTimeout(() => triggerNow().catch((e) => logger.error(e.message)), 3000);
  } else {
    logger.info(`DB has ${count} open hackathons — no immediate scrape needed`);
  }
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
