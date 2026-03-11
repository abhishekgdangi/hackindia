/**
 * routes/hackathons.js
 * All hackathon-related REST endpoints.
 */

const express    = require("express");
const Hackathon  = require("../models/Hackathon");
const AgentLog   = require("../models/AgentLog");
const logger     = require("../utils/logger");
const router     = express.Router();

// Fisher-Yates shuffle
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}


/* ── GET /api/hackathons ──────────────────────────────────────────
   Query params: domain, mode, city, teamSize, sort, page, limit, search, featured */
router.get("/", async (req, res) => {
  try {
    const {
      domain, mode, city, teamSize,
      sort = "deadline", page = 1, limit = 20,
      search, featured, source,
    } = req.query;

    const filter = {
      status:   "OPEN",
      isActive: true,
      registrationDeadline: { $gte: new Date() },
    };

    if (domain   && domain   !== "All") filter.domains        = { $in: [domain] };
    if (mode     && mode     !== "All") filter.mode           = mode;
    if (source   && source   !== "All") filter.sourcePlatform = source;
    if (featured === "true")            filter.isFeatured     = true;

    if (city && city !== "All") {
      if (city === "Online") filter.mode = "Online";
      else                   filter.city = { $regex: city, $options: "i" };
    }

    if (teamSize && teamSize !== "All") {
      if (teamSize === "Solo")  filter.teamSizeMax  = 1;
      else if (teamSize === "2–4") {
        filter.teamSizeMin = { $lte: 4 };
        filter.teamSizeMax = { $gte: 2 };
      }
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
    res.json({
      success: true,
      total,
      page:   parseInt(page),
      pages:  Math.ceil(total / parseInt(limit)),
      count:  data.length,
      data,
    });
  } catch (err) {
    logger.error(`GET /hackathons: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── GET /api/hackathons/featured ─────────────────────────────── */
router.get("/featured", async (req, res) => {
  try {
    const data = await Hackathon
      .find({
        status: "OPEN", isActive: true, isFeatured: true,
        registrationDeadline: { $gte: new Date() },
      })
      .sort({ qualityScore: -1, registrationDeadline: 1 })
      .limit(6)
      .lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── GET /api/hackathons/stats ────────────────────────────────── */
router.get("/stats", async (req, res) => {
  try {
    const baseFilter = {
      status: "OPEN", isActive: true,
      registrationDeadline: { $gte: new Date() },
    };

    const [totalOpen, byDomain, byPlatform, prizeAgg, lastLog] = await Promise.all([
      Hackathon.countDocuments(baseFilter),
      Hackathon.aggregate([
        { $match: baseFilter },
        { $unwind: "$domains" },
        { $group: { _id: "$domains", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      Hackathon.aggregate([
        { $match: baseFilter },
        { $group: { _id: "$sourcePlatform", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Hackathon.aggregate([
        { $match: baseFilter },
        { $group: { _id: null, total: { $sum: "$prizeNumeric" } } },
      ]),
      AgentLog.findOne({ agent: "UpdateAgent" }).sort({ createdAt: -1 }).lean(),
    ]);

    res.json({
      success: true,
      data: {
        totalOpen,
        byDomain,
        byPlatform,
        totalPrizePool: prizeAgg[0]?.total || 0,
        lastUpdated:    lastLog?.createdAt  || null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── GET /api/hackathons/:slug ────────────────────────────────── */
router.get("/:slug", async (req, res) => {
  try {
    const h =
      (await Hackathon.findOne({ slug: req.params.slug }).lean()) ||
      (await Hackathon.findById(req.params.slug).lean().catch(() => null));

    if (!h) return res.status(404).json({ success: false, error: "Not found" });

    // Async view count increment
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
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }
  // Respond immediately, run async
  res.json({ success: true, message: "Pipeline triggered in background" });
  const { runFullPipeline } = require("../agents/updateAgent");
  runFullPipeline().catch((e) => logger.error(`Admin pipeline error: ${e.message}`));
});

module.exports = router;
