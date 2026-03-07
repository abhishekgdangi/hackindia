/**
 * agents/updateAgent.js
 *
 * Orchestrates the full pipeline:
 *   Step 1  — expireClosedHackathons()
 *   Step 2  — runAllScrapers()
 *   Step 3  — validateBatch()
 *   Step 4  — classifyAll()  (Groq / Llama)
 *   Step 5  — Hackathon.bulkWrite()  (upsert to MongoDB)
 */

const Hackathon     = require("../models/Hackathon");
const AgentLog      = require("../models/AgentLog");
const { runAllScrapers, runInternshipScrapers } = require("../scrapers");
const Internship = require("../models/Internship");
const { validateBatch, expireClosedHackathons } = require("./validationAgent");
const { classifyAll }             = require("./classificationAgent");
const logger                      = require("../utils/logger");

async function runFullPipeline() {
  const startedAt = Date.now();
  const divider   = "═".repeat(50);

  logger.info(divider);
  logger.info(" UpdateAgent  ›  Full pipeline starting");
  logger.info(divider);

  const stats = {
    scraped:    0,
    valid:      0,
    classified: 0,
    upserted:   0,
    expired:    0,
    errors:     [],
  };

  /* ── Step 1: Expire past-deadline hackathons ─────────────────── */
  try {
    stats.expired = await expireClosedHackathons();
    logger.info(`Step 1 ✔  Expired ${stats.expired} closed hackathons`);
  } catch (e) {
    stats.errors.push(`expire: ${e.message}`);
    logger.error(`Step 1 ✘  Expire failed: ${e.message}`);
  }

  /* ── Step 2: Scrape all platforms ────────────────────────────── */
  let raw = [];
  try {
    raw          = await runAllScrapers();
    stats.scraped = raw.length;
    logger.info(`Step 2 ✔  Scraped ${raw.length} raw items`);
  } catch (e) {
    stats.errors.push(`scrape: ${e.message}`);
    logger.error(`Step 2 ✘  Scrape failed: ${e.message}`);
  }

  if (!raw.length) {
    logger.warn("No items scraped — pipeline stopping early");
    await _saveLog(stats, Date.now() - startedAt);
    return stats;
  }

  /* ── Step 3: Validate ─────────────────────────────────────────── */
  let validated = [];
  try {
    const allValidated = await validateBatch(raw);
    validated          = allValidated.filter((r) => r.isValid && !r.isDuplicate);
    stats.valid        = validated.length;
    logger.info(`Step 3 ✔  ${validated.length}/${raw.length} passed validation`);
  } catch (e) {
    stats.errors.push(`validate: ${e.message}`);
    logger.error(`Step 3 ✘  Validation error: ${e.message}`);
    validated = raw; // fallback: trust scraped data
  }

  /* ── Step 4: AI Classification (Groq / Llama) ────────────────── */
  let classified = [];
  try {
    classified       = await classifyAll(validated);
    stats.classified = classified.length;
    logger.info(`Step 4 ✔  Classified ${classified.length} hackathons`);
  } catch (e) {
    stats.errors.push(`classify: ${e.message}`);
    logger.error(`Step 4 ✘  Classification error: ${e.message}`);
    classified = validated; // proceed without enrichment
  }

  /* ── Step 5: Upsert to MongoDB ───────────────────────────────── */
  if (classified.length) {
    try {
      const ops = classified.map((h) => ({
        updateOne: {
          filter: _upsertFilter(h),
          update: {
            $set: {
              ..._clean(h),
              status:           "OPEN",
              isActive:         true,
              registrationOpen: true,
              lastScrapedAt:    new Date(),
            },
            $setOnInsert: { createdAt: new Date() },
          },
          upsert: true,
        },
      }));

      const result = await Hackathon.bulkWrite(ops, { ordered: false });
      stats.upserted =
        (result.upsertedCount || 0) + (result.modifiedCount || 0);

      logger.info(
        `Step 5 ✔  MongoDB: ${result.upsertedCount} inserted, ${result.modifiedCount} updated`
      );
    } catch (e) {
      stats.errors.push(`upsert: ${e.message}`);
      logger.error(`Step 5 ✘  DB upsert failed: ${e.message}`);
    }
  }

  /* ── Done ────────────────────────────────────────────────────── */
  const duration = Date.now() - startedAt;
  logger.info(divider);
  logger.info(
    ` Pipeline done in ${(duration / 1000).toFixed(1)}s  |  ` +
    `Scraped: ${stats.scraped}  Valid: ${stats.valid}  Upserted: ${stats.upserted}`
  );
  logger.info(divider);

  await _saveLog(stats, duration);
  return stats;
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function _upsertFilter(h) {
  if (h.externalId && h.sourcePlatform) {
    return { externalId: h.externalId, sourcePlatform: h.sourcePlatform };
  }
  return { name: h.name, sourcePlatform: h.sourcePlatform };
}

const ALLOWED_FIELDS = [
  "name","slug","organizer","logo","mode","city","state","country",
  "startDate","endDate","registrationDeadline",
  "prize","prizeNumeric","teamSizeMin","teamSizeMax","teamSizeLabel",
  "domains","tags","level","eligibility","description",
  "applyLink","websiteLink","sourceUrl","sourcePlatform","externalId",
  "registrationCount","isFeatured","qualityScore",
  "lastValidatedAt","linkBroken",
];

function _clean(h) {
  const out = {};
  for (const k of ALLOWED_FIELDS) {
    if (h[k] !== undefined && h[k] !== null) out[k] = h[k];
  }
  return out;
}

async function _saveLog(stats, durationMs) {
  await AgentLog.create({
    agent:          "UpdateAgent",
    action:         "full_pipeline",
    status:         stats.errors.length ? "partial" : "success",
    itemsProcessed: stats.scraped,
    itemsAdded:     stats.upserted,
    itemsRemoved:   stats.expired,
    durationMs,
    message:
      `Pipeline complete. Upserted: ${stats.upserted}, Expired: ${stats.expired}`,
    metadata: stats,
  }).catch(() => {});
}

module.exports = { runFullPipeline };
