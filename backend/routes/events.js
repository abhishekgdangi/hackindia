/**
 * routes/events.js
 * REST endpoints for technical events.
 * GET /api/events — list events with filters
 */

const express = require("express");
const Event   = require("../models/Event");
const logger  = require("../utils/logger");
const router  = express.Router();

// Fisher-Yates shuffle
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Handle city aliases (Bangalore ↔ Bengaluru etc.)
function cityRegex(city) {
  const aliases = {
    "bangalore": "bengaluru|bangalore",
    "bengaluru": "bengaluru|bangalore",
    "delhi":     "delhi|new delhi",
    "new delhi": "delhi|new delhi",
    "gurugram":  "gurugram|gurgaon",
    "gurgaon":   "gurugram|gurgaon",
    "mumbai":    "mumbai|bombay",
  };
  return aliases[(city || "").toLowerCase()] || city;
}

/* ── GET /api/events ─────────────────────────────────────────────
   Query params: type, location, price, search, limit, page       */
router.get("/", async (req, res) => {
  try {
    const {
      type, location, price,
      search,
      page  = 1,
      limit = 1000,
    } = req.query;

    // Accept all events — don't filter by isActive/status since scrapers don't set those
    const filter = {};

    if (type     && type     !== "All") filter.eventType = type;
    if (price    && price    !== "All") filter.price     = price;
    if (location && location !== "All") {
      if (location === "Online")
        filter.location = { $regex: "online|virtual", $options: "i" };
      else if (location === "Offline")
        filter.$nor = [{ location: { $regex: "online|virtual", $options: "i" } }];
      else
        filter.location = { $regex: cityRegex(location), $options: "i" };
    }
    if (search) {
      filter.$or = [
        { title:       { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { platform:    { $regex: search, $options: "i" } },
      ];
    }

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await Event.countDocuments(filter);
    const data  = await Event
      .find(filter)
      .sort({ scrapedAt: -1 })
      .skip(skip)
      .limit(Math.min(parseInt(limit), 1000))
      .select("-__v")
      .lean();

    shuffle(data);
    res.json({
      success: true,
      total,
      page:  parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      count: data.length,
      data,
    });
  } catch (err) {
    logger.error(`GET /events: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
