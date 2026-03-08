/**
 * jobs/seed.js
 * Wipes DB → runs all live scrapers (NO fake seed data)
 * Run once on fresh install: node jobs/seed.js
 */
require("dotenv").config();
const mongoose   = require("mongoose");
const Hackathon  = require("../models/Hackathon");
const Internship = require("../models/Internship");
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

  const [fH, fI] = await Promise.all([Hackathon.countDocuments(), Internship.countDocuments()]);
  logger.info(`📊 Final DB: ${fH} hackathons, ${fI} internships`);
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(e => { logger.error(e.message); process.exit(1); });
