/**
 * scrapers/index.js — ALL active scrapers
 *
 * HACKATHON: Devpost, HackClub, TAIKAI, Hackathon.com, DevEvents, Devfolio, HackerEarth
 * INTERNSHIP: Internshala, Remotive
 * EVENTS: Eventbrite, GoogleDev, Luma, HasGeek
 *
 * REMOVED: MLH, Unstop, DoraHacks, LetsIntern, Fresherworld, Hirist,
 *          Twenty19, Apna, KonfHub, UnstopEvents, GDGCommunity, DevEventsIndia
 */

const devpost      = require("./devpost");
const hackclub     = require("./hackclub");
const taikai       = require("./taikai");
const hackathoncom = require("./hackathoncom");
const devevents    = require("./devevents");
const hackerearth  = require("./hackerearth");
const internshala  = require("./internshala");
const remotive     = require("./remotive");

const { scrapeEventbrite }    = require("./eventbriteScraper");
const { scrapeGoogleDev }     = require("./googleDev");
const { scrapeLuma }          = require("./luma");
const { scrapeHasGeek }       = require("./hasgeek");
const { scrapeIndiaExpos }     = require("./indiaExpos");

const logger = require("../utils/logger");

// ── Hackathons ────────────────────────────────────────────────────
async function runHackathonScrapers() {
  const scrapers = [
    { name: "Devpost",       fn: () => devpost.scrape(),      tier: 1 },
    { name: "HackClub",      fn: () => hackclub.scrape(),     tier: 1 },
    { name: "TAIKAI",        fn: () => taikai.scrape(),       tier: 1 },
    { name: "Hackathon.com", fn: () => hackathoncom.scrape(), tier: 2 },
    { name: "DevEvents",     fn: () => devevents.scrape(),    tier: 2 },
    { name: "HackerEarth",   fn: () => hackerearth.scrape(),  tier: 3 },
  ];

  logger.info(`[Scrapers] Running ${scrapers.length} hackathon scrapers…`);
  const results = [];
  for (const s of scrapers) {
    logger.info(`  → ${s.name} (Tier ${s.tier})…`);
    try {
      const arr = await s.fn();
      logger.info(`  ✔ ${s.name}: ${arr.length} hackathons`);
      results.push(...arr);
    } catch (err) {
      logger.warn(`  ✖ ${s.name} failed: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 2500));
  }
  logger.info(`[Scrapers] Total hackathons scraped: ${results.length}`);
  return results;
}

// ── Internships ───────────────────────────────────────────────────
async function runInternshipScrapers() {
  const scrapers = [
    { name: "Internshala", fn: () => internshala.scrape() },
    { name: "Remotive",    fn: () => remotive.scrape()    },
  ];

  logger.info(`[Scrapers] Running ${scrapers.length} internship scrapers…`);
  const results = [];
  for (const s of scrapers) {
    logger.info(`  → ${s.name}…`);
    try {
      const arr = await s.fn();
      logger.info(`  ✔ ${s.name}: ${arr.length} internships`);
      results.push(...arr);
    } catch (err) {
      logger.warn(`  ✖ ${s.name} failed: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  logger.info(`[Scrapers] Total internships scraped: ${results.length}`);
  if (results.length === 0) logger.warn("⚠ No internships scraped — check scraper logs above");
  return results;
}

// ── Events ────────────────────────────────────────────────────────
async function runEventScrapers() {
  const scrapers = [
    { name: "Eventbrite", fn: scrapeEventbrite },
    { name: "GoogleDev",  fn: scrapeGoogleDev  },
    { name: "Luma",       fn: scrapeLuma       },
    { name: "HasGeek",    fn: scrapeHasGeek    },
    { name: "IndiaExpos", fn: scrapeIndiaExpos },
  ];

  logger.info(`[Scrapers] Running ${scrapers.length} event scrapers…`);
  const results = [];
  for (const s of scrapers) {
    logger.info(`  → ${s.name}…`);
    try {
      const arr = await s.fn();
      logger.info(`  ✔ ${s.name}: ${arr.length} events`);
      results.push(...arr);
    } catch (err) {
      logger.warn(`  ✖ ${s.name} failed: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  logger.info(`[Scrapers] Total events scraped: ${results.length}`);
  if (results.length === 0) logger.warn("⚠ No events scraped — check scraper logs above");
  return results;
}

// ── Single scraper runner ─────────────────────────────────────────
async function runSingleScraper(name) {
  const map = {
    devpost:      () => devpost.scrape(),
    hackclub:     () => hackclub.scrape(),
    taikai:       () => taikai.scrape(),
    hackathoncom: () => hackathoncom.scrape(),
    devevents:    () => devevents.scrape(),
    hackerearth:  () => hackerearth.scrape(),
    internshala:  () => internshala.scrape(),
    remotive:     () => remotive.scrape(),
    eventbrite:   scrapeEventbrite,
    googledev:    scrapeGoogleDev,
    luma:         scrapeLuma,
    hasgeek:      scrapeHasGeek,
    indiaexpos:   scrapeIndiaExpos,
  };
  const key = name.toLowerCase();
  if (!map[key]) throw new Error(`Unknown scraper: ${name}`);
  logger.info(`[Scrapers] Running single scraper: ${name}`);
  return await map[key]();
}

const runAllScrapers = runHackathonScrapers; // alias for seed.js
module.exports = { runAllScrapers, runHackathonScrapers, runInternshipScrapers, runEventScrapers, runSingleScraper };
