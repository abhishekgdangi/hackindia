/**
 * jobs/scheduler.js
 * Registers all node-cron jobs. Called once at server startup.
 *
 *  Job                      Schedule (IST)      Description
 *  ───────────────────────  ──────────────────  ──────────────────────────────
 *  Full pipeline            every 6 hours       Scrape → Validate → Classify → DB
 *  Expire stale records     every 1 hour        Mark past-deadline as CLOSED
 *  Link health check        every 12 hours      HEAD-check all active links
 *  Daily stats              midnight            Log open/closed/total counts
 */

const cron     = require("node-cron");
const logger   = require("../utils/logger");
const { runFullPipeline }           = require("../agents/updateAgent");
const { expireClosedHackathons }    = require("../agents/validationAgent");
const Hackathon = require("../models/Hackathon");
const axios     = require("axios");

let pipelineRunning = false;

function registerJobs() {
  const intervalHours = parseInt(process.env.SCRAPE_INTERVAL_HOURS || "6");

  /* ── Job 1: Full pipeline ──────────────────────────────────────
     Default: every 6 hours → cron "0 *\/6 * * *"  */
  const pipelineSchedule = `0 */${intervalHours} * * *`;
  cron.schedule(
    pipelineSchedule,
    async () => {
      if (pipelineRunning) {
        logger.warn("[Scheduler] Full pipeline skipped — previous run still active");
        return;
      }
      pipelineRunning = true;
      logger.info(`[Scheduler] ⚡ Full pipeline triggered  (${pipelineSchedule} IST)`);
      try {
        await runFullPipeline();
      } catch (e) {
        logger.error(`[Scheduler] Pipeline error: ${e.message}`);
      } finally {
        pipelineRunning = false;
      }
    },
    { timezone: "Asia/Kolkata" }
  );

  /* ── Job 2: Expire stale records every hour ─────────────────── */
  cron.schedule(
    "0 * * * *",
    async () => {
      try {
        const n = await expireClosedHackathons();
        if (n) logger.info(`[Scheduler] Hourly expire: ${n} hackathons marked CLOSED`);
      } catch (e) {
        logger.error(`[Scheduler] Hourly expire error: ${e.message}`);
      }
    },
    { timezone: "Asia/Kolkata" }
  );

  /* ── Job 3: Link health check every 12 hours ─────────────────── */
  cron.schedule(
    "0 */12 * * *",
    async () => {
      logger.info("[Scheduler] 🔗 Starting link health check…");
      try {
        const hacks = await Hackathon
          .find({ isActive: true, status: "OPEN" })
          .select("_id name applyLink")
          .limit(100)
          .lean();

        let broken = 0;
        for (const h of hacks) {
          try {
            await axios.head(h.applyLink, {
              timeout: 8000,
              maxRedirects: 5,
              headers: { "User-Agent": "HackIndiaBot/1.0" },
            });
          } catch {
            await Hackathon.findByIdAndUpdate(h._id, { linkBroken: true });
            broken++;
            logger.warn(`[Scheduler] Broken: "${h.name}"  ${h.applyLink}`);
          }
          await new Promise((r) => setTimeout(r, 400));
        }

        logger.info(`[Scheduler] Link health done: ${broken}/${hacks.length} broken`);
      } catch (e) {
        logger.error(`[Scheduler] Link health error: ${e.message}`);
      }
    },
    { timezone: "Asia/Kolkata" }
  );

  /* ── Job 4: Daily stats at midnight IST ─────────────────────── */
  cron.schedule(
    "0 0 * * *",
    async () => {
      try {
        const [open, closed, total] = await Promise.all([
          Hackathon.countDocuments({ status: "OPEN",   isActive: true }),
          Hackathon.countDocuments({ status: "CLOSED" }),
          Hackathon.countDocuments(),
        ]);
        logger.info(
          `[Scheduler] Daily stats ── Open: ${open}  Closed: ${closed}  Total: ${total}`
        );
      } catch (e) {
        logger.error(`[Scheduler] Daily stats error: ${e.message}`);
      }
    },
    { timezone: "Asia/Kolkata" }
  );

  logger.info(`[Scheduler] ✅ All jobs registered (IST timezone)`);
  logger.info(`  • Full pipeline : ${pipelineSchedule}`);
  logger.info(`  • Expire stale  : every hour`);
  logger.info(`  • Link health   : every 12h`);
  logger.info(`  • Daily stats   : midnight`);
}

/** Immediately trigger the full pipeline (used on first-boot if DB empty) */
async function triggerNow() {
  if (pipelineRunning) {
    logger.warn("[Scheduler] triggerNow: already running");
    return;
  }
  pipelineRunning = true;
  try {
    await runFullPipeline();
  } finally {
    pipelineRunning = false;
  }
}

module.exports = { registerJobs, triggerNow };
