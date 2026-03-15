/**
 * jobs/seed.js
 * Wipes DB → runs all live scrapers (NO fake seed data)
 * Run once on fresh install: node jobs/seed.js
 */
require("dotenv").config();
const mongoose   = require("mongoose");
const Hackathon  = require("../models/Hackathon");
const Internship = require("../models/Internship");
const Event      = require("../models/Event");
const logger     = require("../utils/logger");

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/hackindia");
  logger.info("Connected to MongoDB");

  logger.info("Skipping DB clear — using upsert to preserve existing data");

  // ── Hackathon scrapers ───────────────────────────────────────────
  logger.info("Running live hackathon scrapers…");
  try {
    const { runAllScrapers } = require("../scrapers");
    const items = await runAllScrapers();
    if (items.length) {
      const ops = items.map(item => ({
        updateOne: {
          filter: { $or: [
            { externalId: item.externalId, sourcePlatform: item.sourcePlatform },
            { name: item.name }
          ]},
          update: { $set: item },
          upsert: true,
        },
      }));
      const r = await Hackathon.bulkWrite(ops, { ordered: false });
      logger.info(`✅ Live hackathons: ${r.upsertedCount} new, ${r.modifiedCount} updated`);
    } else {
      logger.warn("⚠ No hackathons scraped — check scraper logs above");
    }
  } catch (e) { logger.error(`Hackathon scrape failed: ${e.message}`); }

  // ── Internship scrapers ──────────────────────────────────────────
  logger.info("Running live internship scrapers…");
  try {
    const { runInternshipScrapers } = require("../scrapers");
    const items = await runInternshipScrapers();
    if (items.length) {
      const ops = items.map(item => ({
        updateOne: {
          filter: { company: item.company, role: item.role },
          update: { $set: item },
          upsert: true,
        },
      }));
      const r = await Internship.bulkWrite(ops, { ordered: false });
      logger.info(`✅ Live internships: ${r.upsertedCount} new, ${r.modifiedCount} updated`);
    } else {
      logger.warn("⚠ No internships scraped — check scraper logs above");
    }
  } catch (e) { logger.error(`Internship scrape failed: ${e.message}`); }

  // ── Event scrapers ───────────────────────────────────────────────
  logger.info("Running live event scrapers…");
  try {
    const { runEventScrapers } = require("../scrapers");
    const items = await runEventScrapers();
    if (items.length) {
      // Parse date strings → ISO Date for server-side expiry filtering
      const parseEventDate = (dateStr) => {
        if (!dateStr || ["TBD","","On Demand","Check site"].includes(dateStr)) return null;
        const d = new Date(dateStr);
        return isNaN(d) ? null : d;
      };
      const ops = items.map(item => ({
        updateOne: {
          filter: { uniqueId: item.uniqueId },
          update: { $set: { ...item, dateISO: parseEventDate(item.date), scrapedAt: new Date() } },
          upsert: true,
        },
      }));
      const r = await Event.bulkWrite(ops, { ordered: false });
      logger.info(`✅ Live events: ${r.upsertedCount} new, ${r.modifiedCount} updated`);
    } else {
      logger.warn("⚠ No events scraped — check scraper logs above");
    }
  } catch (e) { logger.error(`Event scrape failed: ${e.message}`); }

  // ── Auto-clean expired events ────────────────────────────────────
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999);

    // Backfill dateISO for any events missing it
    const noDates = await Event.find({ $or: [{ dateISO: { $exists: false } }, { dateISO: null }], date: { $nin: ["", "TBD", "On Demand", "Check site"] } }).lean();
    const backfillOps = noDates
      .map(ev => ({ ev, d: new Date(ev.date) }))
      .filter(({ d }) => !isNaN(d))
      .map(({ ev, d }) => ({ updateOne: { filter: { _id: ev._id }, update: { $set: { dateISO: d } } } }));
    if (backfillOps.length) {
      await Event.bulkWrite(backfillOps);
      logger.info(`📅 Backfilled dateISO for ${backfillOps.length} events`);
    }

    // Delete past events
    const del = await Event.deleteMany({ dateISO: { $lt: yesterday, $ne: null } });
    if (del.deletedCount > 0) logger.info(`🗑  Removed ${del.deletedCount} expired events`);
  } catch (e) { logger.error(`Cleanup failed: ${e.message}`); }

  const [fH, fI, fE] = await Promise.all([Hackathon.countDocuments(), Internship.countDocuments(), Event.countDocuments()]);
  logger.info(`📊 Final DB: ${fH} hackathons, ${fI} internships, ${fE} events`);
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(e => { logger.error(e.message); process.exit(1); });
