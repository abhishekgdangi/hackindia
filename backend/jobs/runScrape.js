/**
 * jobs/runScrape.js — Manual CLI scrape tool
 *
 * Usage:
 *   node jobs/runScrape.js               full pipeline (all 15 scrapers)
 *
 *   HACKATHON scrapers:
 *   node jobs/runScrape.js devpost
 *   node jobs/runScrape.js devfolio
 *   node jobs/runScrape.js hack2skill
 *   node jobs/runScrape.js hackathoncom
 *   node jobs/runScrape.js allhackathons
 *   node jobs/runScrape.js devevents
 *   node jobs/runScrape.js lablab
 *   node jobs/runScrape.js taikai
 *   node jobs/runScrape.js reskilll
 *
 *   INTERNSHIP scrapers:
 *   node jobs/runScrape.js internshala
 *   node jobs/runScrape.js letsintern
 *   node jobs/runScrape.js fresherworld
 *   node jobs/runScrape.js remotive
 *   node jobs/runScrape.js wellfound
 *   node jobs/runScrape.js ycombinator
 */
require("dotenv").config();
const mongoose = require("mongoose");
const logger   = require("../utils/logger");

async function main() {
  const platform = process.argv[2]?.toLowerCase() || null;
  const uri      = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/hackindia";

  await mongoose.connect(uri);
  logger.info(`Connected: ${uri}`);

  if (!platform) {
    logger.info("Running FULL pipeline (9 hackathon + 6 internship scrapers)…");
    const { runFullPipeline } = require("../agents/updateAgent");
    const stats = await runFullPipeline();
    logger.info(`Done: ${JSON.stringify(stats)}`);
  } else {
    logger.info(`Running single scraper: ${platform}`);
    const { runScraper } = require("../scrapers");
    const items = await runScraper(platform);
    logger.info(`${platform} → ${items.length} items`);
    items.slice(0, 3).forEach((h, i) =>
      logger.info(`  [${i}] "${h.name || h.role}" → ${h.applyLink}`)
    );
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(e => { logger.error(e.message); process.exit(1); });
