/**
 * jobs/cleanexpired.js
 * Remove expired events from DB. Run after seed.
 * Usage: node jobs/cleanexpired.js
 */
const mongoose = require("mongoose");
const Event    = require("../models/Event");
const logger   = require("../utils/logger");
require("dotenv").config();

async function cleanExpired() {
  const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/hackindia";
  await mongoose.connect(MONGO_URI);
  logger.info("Connected to MongoDB");

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(23, 59, 59, 999);

  // Delete events with a real past date
  const result = await Event.deleteMany({
    dateISO: { $lt: yesterday, $ne: null },
  });
  logger.info(`🗑  Deleted ${result.deletedCount} expired events`);

  // Also backfill dateISO for events that don't have it yet
  const noDate = await Event.find({ dateISO: { $exists: false } }).lean();
  let backfilled = 0;
  for (const ev of noDate) {
    if (!ev.date || ["TBD","","On Demand","Check site"].includes(ev.date)) continue;
    const d = new Date(ev.date);
    if (!isNaN(d)) {
      await Event.updateOne({ _id: ev._id }, { $set: { dateISO: d } });
      backfilled++;
    }
  }
  logger.info(`📅 Backfilled dateISO for ${backfilled} events`);

  await mongoose.disconnect();
  logger.info("Done.");
}

cleanExpired().catch(e => { console.error(e); process.exit(1); });
