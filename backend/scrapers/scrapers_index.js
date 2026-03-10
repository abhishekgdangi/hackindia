/**
 * scrapers/index.js — ALL active scrapers
 *
 * ═══════════════════════════════════════════════
 *  HACKATHON SCRAPERS
 * ═══════════════════════════════════════════════
 *
 * ✅ Tier 1 — Confirmed public JSON APIs:
 *    • Devpost      — devpost.com/api/hackathons       (60-80 results)
 *    • HackClub     — hackathons.hackclub.com API       (2-20 results)
 *    • TAIKAI       — taikai.network HTML               (1-5 results)
 *
 * ✅ Tier 2 — HTML scrapers:
 *    • Hackathon.com — hackathon.com listing HTML       (3-8 results)
 *    • DevEvents     — devents.io listing               (1-3 results)
 *
 * ✅ Tier 3 — Internal API / __NEXT_DATA__:
 *    • Devfolio      — api.devfolio.co REST             (20-30 results)
 *    • HackerEarth   — hackerearth.com HTML cards       (10-20 results)
 *
 * ❌ REMOVED (permanently broken / 0 results):
 *    MLH (0 parsed), Unstop (API 404), DoraHacks (405 blocked),
 *    LetsIntern (404), Fresherworld (JS-rendered), Hirist (404),
 *    Twenty19 (dead domain), Apna (404), KonfHub (404), UnstopEvents
 *
 * ═══════════════════════════════════════════════
 *  INTERNSHIP SCRAPERS
 * ═══════════════════════════════════════════════
 *
 * ✅ Working:
 *    • Internshala  — 500+ results (India #1)
 *    • Remotive     — 3-10 remote results
 *
 * ═══════════════════════════════════════════════
 *  EVENT SCRAPERS
 * ═══════════════════════════════════════════════
 *
 * ✅ Working:
 *    • Eventbrite     — India tech events (direct event URLs)
 *    • GoogleDev      — Google Dev events (India + Online only)
 *    • Luma           — Luma India calendars
 *    • GDGCommunity   — GDG DevFests India
 *    • DevEventsIndia — dev.events India meetups/conferences
 *    • HasGeek        — HasGeek India dev events
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
const { scrapeEventbrite }    = require("./eventbriteScraper");
const { scrapeGoogleDev }     = require("./googleDev");
const { scrapeLuma }          = require("./luma");
const { scrapeGDGCommunity }  = require("./gdgCommunity");
const { scrapeDevEventsIndia }= require("./devEventsIndia");
const { scrapeHasGeek }       = require("./hasgeek");

const logger = require("../utils/logger");


