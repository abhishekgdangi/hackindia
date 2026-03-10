/**
 * scrapers/hackclub.js — Hack Club
 * Fixed: API returning 500 — switched to fallback HTML + alternate endpoints
 */
const BaseScraper = require("./base");
const cheerio     = require("cheerio");
const logger      = require("../utils/logger");

const INDIA_RE = /india|bangalore|bengaluru|mumbai|delhi|hyderabad|pune|chennai|kolkata|noida|gurugram/i;

class HackClubScraper extends BaseScraper {
  constructor() {
    super("HackClub");
    this.apiUrls = [
      "https://hackathons.hackclub.com/api/events/upcoming",
      "https://hackathons.hackclub.com/api/events",
    ];
    this.htmlUrl = "https://hackathons.hackclub.com";
  }

  async scrape() {
    logger.info("[HackClub] Starting scrape…");
    const results = [];
    const seen    = new Set();

    // Strategy 1: JSON API
    for (const url of this.apiUrls) {
      try {
        const res    = await this.get(url, { headers: { Accept: "application/json" }, timeout: 20000 });
        const events = Array.isArray(res.data) ? res.data : (res.data?.events || []);
        if (events.length > 0) {
          logger.info(`[HackClub] API ${url} → ${events.length} events`);
          for (const e of events) {
            const h = this._parseJson(e);
            if (h && !seen.has(h.externalId)) { seen.add(h.externalId); results.push(h); }
          }
          if (results.length > 0) { logger.info(`[HackClub] Returning ${results.length}`); return results; }
        }
      } catch (err) {
        logger.warn(`[HackClub] API ${url} failed: ${err.message}`);
      }
    }

    // Strategy 2: HTML scrape
    try {
      const res = await this.get(this.htmlUrl, {
        headers: { "User-Agent": "Mozilla/5.0 Chrome/125.0.0.0", Accept: "text/html" },
        timeout: 25000,
      });
      const $    = cheerio.load(res.data);
      // Try Next.js data first
      const nd   = $("script#__NEXT_DATA__").html();
      if (nd) {
        const json   = JSON.parse(nd);
        const events = json?.props?.pageProps?.events || json?.props?.pageProps?.hackathons || [];
        logger.info(`[HackClub] NEXT_DATA → ${events.length} events`);
        for (const e of events) {
          const h = this._parseJson(e);
          if (h && !seen.has(h.externalId)) { seen.add(h.externalId); results.push(h); }
        }
        if (results.length > 0) { logger.info(`[HackClub] Returning ${results.length}`); return results; }
      }

      // Card scraping
      const cards = $("[class*='event'], [class*='hackathon'], article, .card").toArray();
      for (const el of cards) {
        const $el = $(el);
        const name = $el.find("h2, h3, h4, .name, .title").first().text().trim();
        if (!name || seen.has(name)) continue;
        const href = $el.find("a[href]").first().attr("href") || "";
        const link = href.startsWith("http") ? href : href ? `https://hackathons.hackclub.com${href}` : "";
        const city = $el.find(".location, [class*='city'], [class*='location']").first().text().trim() || "Online";
        const isIndia = INDIA_RE.test(city);
        const isOnline = /online|virtual|remote/i.test(city);
        if (!isIndia && !isOnline) continue;
        seen.add(name);
        results.push(this.normalise({
          name, organizer: "Hack Club", mode: isOnline ? "Online" : "Offline",
          city, applyLink: link || "https://hackathons.hackclub.com",
          sourceUrl: this.htmlUrl, externalId: `hackclub-${name.toLowerCase().replace(/\W+/g,"-")}`,
          logo: "🏫", tags: ["Student", "HackClub"],
        }));
      }
    } catch (err) {
      logger.warn(`[HackClub] HTML fallback failed: ${err.message}`);
    }

    logger.info(`[HackClub] Returning ${results.length} hackathons`);
    return results;
  }

  _parseJson(e) {
    if (!e.name) return null;
    const city = e.virtual ? "Online" : (e.city || e.location || "Global");
    const mode = e.hybrid ? "Online + Offline" : e.virtual ? "Online" : "Offline";
    const isIndia = INDIA_RE.test(city + " " + (e.country || ""));
    const isOnline = mode !== "Offline";
    if (!isIndia && !isOnline) return null;
    return this.normalise({
      name: e.name.trim(), organizer: "Hack Club", mode, city,
      country: e.country || "Global",
      startDate: e.start, endDate: e.end, registrationDeadline: e.start,
      applyLink: e.website || "https://hackathons.hackclub.com",
      sourceUrl: "https://hackathons.hackclub.com",
      externalId: String(e.id || e.name), logo: "🏫",
      tags: ["Student", "HackClub", ...(e.mlhAssociated ? ["MLH"] : [])],
    });
  }
}

const _inst = new HackClubScraper();
module.exports = { scrape: () => _inst.scrape() };
