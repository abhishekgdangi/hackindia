/**
 * routes/hackathons.js
 */

const express   = require("express");
const Hackathon = require("../models/Hackathon");
const AgentLog  = require("../models/AgentLog");
const logger    = require("../utils/logger");
const router    = express.Router();

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cityRegex(city) {
  const map = {
    "Bangalore": "bengaluru|bangalore",
    "Bengaluru": "bengaluru|bangalore",
    "Delhi":     "delhi|new delhi",
    "New Delhi": "delhi|new delhi",
    "Mumbai":    "mumbai|bombay",
    "Hyderabad": "hyderabad|secunderabad",
    "Chennai":   "chennai|madras",
    "Kolkata":   "kolkata|calcutta",
    "Pune":      "pune",
  };
  return map[city] || city;
}

/* ── GET /api/hackathons ─────────────────────────────────────── */
router.get("/", async (req, res) => {
  try {
    const {
      domain, mode, city, teamSize,
      sort = "deadline", page = 1, limit = 20,
      search, featured, source,
    } = req.query;

    const now = new Date();

    // Strict filter: must have a future registration deadline
    // OR no deadline stored but hackathon end date is future
    const filter = {
      $and: [
        // Not closed/inactive
        { $or: [{ status: { $ne: "CLOSED" } }, { status: { $exists: false } }] },
        { $or: [{ isActive: { $ne: false } }, { isActive: { $exists: false } }] },
        // Must have future deadline — if null/missing AND no endDate, exclude
        {
          $or: [
            { registrationDeadline: { $gte: now } },
            {
              $and: [
                { $or: [{ registrationDeadline: null }, { registrationDeadline: { $exists: false } }] },
                { $or: [{ endDate: { $gte: now } }, { hackEnd: { $gte: now } }] },
              ],
            },
          ],
        },
      ],
    };

    if (domain  && domain  !== "All") filter.domains        = { $in: [domain] };
    if (mode    && mode    !== "All") filter.mode           = mode;
    if (source  && source  !== "All") filter.sourcePlatform = source;
    if (featured === "true")          filter.isFeatured     = true;

    if (city && city !== "All") {
      if (city === "Online") filter.mode = "Online";
      else filter.city = { $regex: cityRegex(city), $options: "i" };
    }

    if (teamSize && teamSize !== "All") {
      if (teamSize === "Solo") filter.teamSizeMax = 1;
      else if (teamSize === "2–4") { filter.teamSizeMin = { $lte: 4 }; filter.teamSizeMax = { $gte: 2 }; }
      else if (teamSize === "5+") filter.teamSizeMax = { $gte: 5 };
    }

    if (search) filter.$text = { $search: search };

    const sortMap = {
      deadline: { registrationDeadline: 1 },
      prize:    { prizeNumeric: -1 },
      popular:  { registrationCount: -1 },
      newest:   { createdAt: -1 },
      quality:  { qualityScore: -1 },
    };
    const sortClause = sortMap[sort] || sortMap.deadline;

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await Hackathon.countDocuments(filter);
    const data  = await Hackathon
      .find(filter)
      .sort(sortClause)
      .skip(skip)
      .limit(Math.min(parseInt(limit), 1000))
      .select("-__v -agentNotes")
      .lean();

    shuffle(data);
    res.json({ success: true, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)), count: data.length, data });
  } catch (err) {
    logger.error(`GET /hackathons: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── GET /api/hackathons/featured ─────────────────────────────── */
router.get("/featured", async (req, res) => {
  try {
    const now = new Date();
    const data = await Hackathon
      .find({
        $or: [{ isActive: { $ne: false } }, { isActive: { $exists: false } }],
        isFeatured: true,
        $or: [{ registrationDeadline: { $gte: now } }, { registrationDeadline: null }],
      })
      .sort({ qualityScore: -1, registrationDeadline: 1 })
      .limit(6)
      .lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── POST /api/hackathons/admin/purge-expired ─────────────────── */
// Permanently delete expired hackathons from DB
router.post("/admin/purge-expired", async (req, res) => {
  const { secret } = req.body;
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const now = new Date();
    const result = await Hackathon.deleteMany({
      $and: [
        { $or: [{ registrationDeadline: { $lt: now } }] },
        { $or: [{ endDate: { $lt: now } }, { endDate: { $exists: false } }] },
        { $or: [{ hackEnd: { $lt: now } }, { hackEnd: { $exists: false } }] },
      ],
    });
    logger.info(`[Admin] Purged ${result.deletedCount} expired hackathons`);
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── POST /api/hackathons/admin/purge-all ─────────────────────── */
// Nuclear option: clear ALL hackathons and re-scrape
router.post("/admin/purge-all", async (req, res) => {
  const { secret } = req.body;
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const result = await Hackathon.deleteMany({});
    logger.info(`[Admin] Purged ALL ${result.deletedCount} hackathons`);
    res.json({ success: true, deleted: result.deletedCount, message: "All hackathons deleted. Trigger /admin/run-pipeline to re-scrape." });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── GET /api/hackathons/stats ────────────────────────────────── */
router.get("/stats", async (req, res) => {
  try {
    const now = new Date();
    const baseFilter = {
      $or: [{ isActive: { $ne: false } }, { isActive: { $exists: false } }],
      $and: [{ $or: [{ registrationDeadline: { $gte: now } }, { registrationDeadline: null }, { registrationDeadline: { $exists: false } }] }],
    };
    const [totalOpen, byDomain, byPlatform, prizeAgg, lastLog] = await Promise.all([
      Hackathon.countDocuments(baseFilter),
      Hackathon.aggregate([{ $match: baseFilter }, { $unwind: "$domains" }, { $group: { _id: "$domains", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]),
      Hackathon.aggregate([{ $match: baseFilter }, { $group: { _id: "$sourcePlatform", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Hackathon.aggregate([{ $match: baseFilter }, { $group: { _id: null, total: { $sum: "$prizeNumeric" } } }]),
      AgentLog.findOne({ agent: "UpdateAgent" }).sort({ createdAt: -1 }).lean(),
    ]);
    res.json({ success: true, data: { totalOpen, byDomain, byPlatform, totalPrizePool: prizeAgg[0]?.total || 0, lastUpdated: lastLog?.createdAt || null } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── GET /api/hackathons/:slug ────────────────────────────────── */
router.get("/:slug", async (req, res) => {
  try {
    const h = (await Hackathon.findOne({ slug: req.params.slug }).lean()) ||
              (await Hackathon.findById(req.params.slug).lean().catch(() => null));
    if (!h) return res.status(404).json({ success: false, error: "Not found" });
    Hackathon.findByIdAndUpdate(h._id, { $inc: { viewCount: 1 } }).exec();
    res.json({ success: true, data: h });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── POST /api/hackathons/:id/bookmark ───────────────────────── */
router.post("/:id/bookmark", async (req, res) => {
  try {
    await Hackathon.findByIdAndUpdate(req.params.id, { $inc: { bookmarkCount: 1 } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── POST /api/hackathons/admin/run-pipeline ─────────────────── */
router.post("/admin/run-pipeline", (req, res) => {
  const { secret } = req.body;
  if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: "Forbidden" });
  res.json({ success: true, message: "Pipeline triggered in background" });
  const { runFullPipeline } = require("../agents/updateAgent");
  runFullPipeline().catch((e) => logger.error(`Admin pipeline error: ${e.message}`));
});

module.exports = router;
