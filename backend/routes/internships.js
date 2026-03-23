/**
 * routes/internships.js
 * Serves internships from DB + triggers Internshala scrape on demand.
 */
const express    = require("express");
const Internship = require("../models/Internship");
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


/* ── GET /api/internships ──────────────────────────────────────── */
router.get("/", async (req, res) => {
  try {
    const { search, skills, location, isRemote, page = 1, limit = 5000 } = req.query;

    const filter = {
      $and: [
        { $or: [{ status: { $ne: "CLOSED" } }, { status: null }, { status: { $exists: false } }] },
        { $or: [{ isActive: { $ne: false } }, { isActive: null }, { isActive: { $exists: false } }] },
      ],
      // Only show internships with future deadline — no expired, no null deadline
      deadline: { $gte: new Date() },
    };

    if (search) filter.$text = { $search: search };
    if (skills)  filter.skills   = { $in: skills.split(",").map(s => s.trim()) };
    if (isRemote === "true")  filter.isRemote  = true;
    if (location && location !== "All" && location !== "Remote") {
      filter.location = { $regex: cityRegex(location), $options: "i" };
    }

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await Internship.countDocuments(filter);
    const data  = await Internship
      .find(filter)
      .sort({ deadline: 1, stipendNumeric: -1 })
      .skip(skip)
      .limit(Math.min(parseInt(limit), 5000))
      .lean();

    shuffle(data);
    res.json({ success: true, total, data });
  } catch (err) {
    logger.error(`GET /internships: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── POST /api/internships/scrape — trigger Internshala scrape ── */
router.post("/scrape", async (req, res) => {
  const { secret } = req.body;
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }
  res.json({ success: true, message: "Internship scrape triggered" });

  // Run async
  try {
    const scraper = require("../scrapers/internshala");
    const items   = await scraper.scrape();
    logger.info(`[InternshipScrape] Got ${items.length} items from Internshala`);

    if (items.length > 0) {
      const ops = items.map(item => ({
        updateOne: {
          filter: { company: item.company, role: item.role },
          update: { $set: { ...item, lastScrapedAt: new Date() } },
          upsert: true,
        },
      }));
      const result = await Internship.bulkWrite(ops, { ordered: false });
      logger.info(`[InternshipScrape] Upserted: ${result.upsertedCount + result.modifiedCount}`);
    }
  } catch (e) {
    logger.error(`[InternshipScrape] Error: ${e.message}`);
  }
});

/* ── GET /api/internships/:id ──────────────────────────────────── */
router.get("/:id", async (req, res) => {
  try {
    const i = await Internship.findById(req.params.id).lean();
    if (!i) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, data: i });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
