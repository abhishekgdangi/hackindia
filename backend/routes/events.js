/**
 * routes/events.js
 * REST endpoints for technical events.
 * GET /api/events — list events with filters
 */

const express = require("express");
const Event   = require("../models/Event");
const logger  = require("../utils/logger");
const router  = express.Router();

/* ── GET /api/events ─────────────────────────────────────────────
   Query params: type, location, price, search, limit, page       */
router.get("/", async (req, res) => {
  try {
    const {
      type, location, price,
      search,
      page  = 1,
      limit = 500,
    } = req.query;

    const filter = { isActive: true };

    if (type     && type     !== "All") filter.eventType = type;
    if (price    && price    !== "All") filter.price     = price;
    if (location && location !== "All") {
      if (location === "Online")  filter.location = { $regex: /online/i };
      else if (location === "Offline") filter.location = { $not: /online/i };
      else filter.location = { $regex: location, $options: "i" };
    }
    if (search) filter.$text = { $search: search };

    const skip   = (parseInt(page) - 1) * parseInt(limit);
    const total  = await Event.countDocuments(filter);
    const data   = await Event
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
