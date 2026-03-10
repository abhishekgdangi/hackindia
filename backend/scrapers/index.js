/**
 * scrapers/index.js — ALL active scrapers
 *
 * ═══════════════════════════════════════════════
 *  HACKATHON SCRAPERS
 * ═══════════════════════════════════════════════
 *
 * ✅ Tier 1 — Confirmed public JSON APIs (most reliable):
 *    • Devpost      — devpost.com/api/hackathons       (60-80 results)
 *    • HackClub     — hackathons.hackclub.com API       (20-40 results)
 *    • TAIKAI       — taikai.network API                (1-5 results)
 *
 * ✅ Tier 2 — HTML/Next.js scrapers (reliable if site is up):
 *    • Hackathon.com — hackathon.com listing HTML       (3-8 results)
 *    • DevEvents     — devents.io listing               (1-3 results)
 *
 * ✅ Tier 3 — Internal API / __NEXT_DATA__ extraction (may vary):
 *    • Devfolio      — api.devfolio.co REST             (0-25 results)
 *    • HackerEarth   — hackerearth.com/api/v3/events    (0-30 results)
 *
 * ❌ REMOVED (permanently broken):
 *    Hack2Skill, Lablab, Reskilll, AllHackathons, YCombinator
 *
 * ═══════════════════════════════════════════════
 *  INTERNSHIP SCRAPERS
 * ═══════════════════════════════════════════════
 *
 * ✅ Working:
 *    • Internshala  — 500+ results (India #1)
 *    • Remotive     — 3-10 remote results
 *
 * ❌ REMOVED: Wellfound (403 blocked)
 */

// ── Tier 1: Public JSON APIs ─────────────────────────────────────
const devpost      = require("./devpost");
const hackclub     = require("./hackclub");
const taikai       = require("./taikai");

// ── Tier 2: HTML scrapers ────────────────────────────────────────
const hackathoncom = require("./hackathoncom");
const devevents    = require("./devevents");

// ── Tier 3: Internal API / __NEXT_DATA__ ─────────────────────────
const devfolio2    = require("./devfolio2");
const hackerearth  = require("./hackerearth");

// ── Internship scrapers ──────────────────────────────────────────
const internshala  = require("./internshala");
const remotive     = require("./remotive");

// ── Event scrapers ───────────────────────────────────────────────
// ── Event scrapers (India-focused, verified working) ──────────
const { scrapeEventbrite }    = require("./eventbriteScraper"); // ✅ India/Online Eventbrite
const { scrapeGoogleDev }     = require("./googleDev");         // ✅ Google Dev events HTML
const { scrapeLuma }          = require("./luma");              // ✅ Luma India calendars
const { scrapeHasGeek }       = require("./hasgeek");
const { scrapeIndiaExpos }     = require("./indiaExpos");           // ✅ HasGeek India dev events

const logger = require("../utils/logger");

/* ═══════════════════════════════════════════════
   HACKATHON SCRAPERS
═══════════════════════════════════════════════ */
async function runAllScrapers() {
  const scrapers = [
    // Tier 1 — most reliable, run first
    { name: "Devpost",       fn: () => devpost.scrape(),      tier: 1 },
    { name: "HackClub",      fn: () => hackclub.scrape(),     tier: 1 },
    { name: "TAIKAI",        fn: () => taikai.scrape(),       tier: 1 },
    // Tier 2 — HTML scraping
    { name: "Hackathon.com", fn: () => hackathoncom.scrape(), tier: 2 },
    { name: "DevEvents",     fn: () => devevents.scrape(),    tier: 2 },
    // Tier 3 — internal APIs (may return 0 if blocked)
    { name: "Devfolio",      fn: () => devfolio2.scrape(),    tier: 3 },
    { name: "HackerEarth",   fn: () => hackerearth.scrape(),  tier: 3 },
  ];

  const results = [];
  logger.info(`[Scrapers] Running ${scrapers.length} hackathon scrapers…`);

  for (const s of scrapers) {
    try {
      logger.info(`  → ${s.name} (Tier ${s.tier})…`);
      const items = await s.fn();
      const arr   = Array.isArray(items) ? items : [];
      logger.info(`  ✔ ${s.name}: ${arr.length} hackathons`);
      results.push(...arr);
    } catch (e) {
      logger.error(`  ✘ ${s.name}: ${e.message}`);
    }
    // Polite delay between scrapers
    await new Promise(r => setTimeout(r, 2500));
  }

  logger.info(`[Scrapers] Total hackathons scraped: ${results.length}`);
  return results;
}

/* ═══════════════════════════════════════════════
   INTERNSHIP SCRAPERS
═══════════════════════════════════════════════ */
async function runInternshipScrapers() {
  const scrapers = [
    { name: "Internshala",  fn: () => internshala.scrape()  },
    { name: "Remotive",     fn: () => remotive.scrape()     },
  ];

  const results = [];
  logger.info(`[Scrapers] Running ${scrapers.length} internship scrapers…`);

  for (const s of scrapers) {
    try {
      logger.info(`  → ${s.name}…`);
      const items = await s.fn();
      const arr   = Array.isArray(items) ? items : [];
      logger.info(`  ✔ ${s.name}: ${arr.length} internships`);
      results.push(...arr);
    } catch (e) {
      logger.error(`  ✘ ${s.name}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 2500));
  }

  logger.info(`[Scrapers] Total internships scraped: ${results.length}`);
  return results;
}

/* ═══════════════════════════════════════════════
   RUN SINGLE SCRAPER BY NAME
═══════════════════════════════════════════════ */
async function runScraper(name) {
  const map = {
    devpost:      () => devpost.scrape(),
    hackclub:     () => hackclub.scrape(),
    taikai:       () => taikai.scrape(),
    hackathoncom: () => hackathoncom.scrape(),
    devevents:    () => devevents.scrape(),
    devfolio:     () => devfolio2.scrape(),
    hackerearth:  () => hackerearth.scrape(),
    internshala:  () => internshala.scrape(),
    remotive:     () => remotive.scrape(),
  };

  const key = name.toLowerCase();
  if (!map[key]) throw new Error(`Unknown scraper: ${name}`);
  logger.info(`[Scrapers] Running single scraper: ${name}`);
  return map[key]();
}

module.exports = { runAllScrapers, runInternshipScrapers, runEventScrapers, runScraper };

/* ═══════════════════════════════════════════════
   EVENT SCRAPERS
═══════════════════════════════════════════════ */
async function runEventScrapers() {
  const scrapers = [
    { name: "Eventbrite",   fn: scrapeEventbrite },    // India + Online
    { name: "GoogleDev",    fn: scrapeGoogleDev },     // Google Dev events
    { name: "Luma",         fn: scrapeLuma },           // Luma India calendars
    { name: "HasGeek",      fn: scrapeHasGeek },        // HasGeek India dev events
  ];

  const results = [];
  logger.info(`[Scrapers] Running ${scrapers.length} event scrapers…`);

  for (const s of scrapers) {
    try {
      logger.info(`  → ${s.name}…`);
      const items = await s.fn();
      const arr   = Array.isArray(items) ? items : [];
      logger.info(`  ✔ ${s.name}: ${arr.length} events`);
      results.push(...arr);
    } catch (e) {
      logger.error(`  ✘ ${s.name}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 2500));
  }

  logger.info(`[Scrapers] Total events scraped: ${results.length}`);
  return results;
}
