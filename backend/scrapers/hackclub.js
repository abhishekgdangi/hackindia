/**
 * scrapers/hackclub.js
 * Hack Club Hackathons — FREE public JSON API (no auth, no rate limit)
 * API: https://hackathons.hackclub.com/api/events/upcoming
 * Docs: https://hackathons.hackclub.com/data/
 *
 * ✅ CONFIRMED WORKING — open JSON API maintained by Hack Club nonprofit
 */

const BaseScraper = require("./base");
const logger      = require("../utils/logger");

class HackClubScraper extends BaseScraper {
  constructor() {
    super("HackClub");
    this.apiUrl = "https://hackathons.hackclub.com/api/events/upcoming";
  }

  async scrape() {
    logger.info("[HackClub] Starting scrape…");
    const results = [];

    try {
      const res  = await this.get(this.apiUrl, {
        headers: { Accept: "application/json", "User-Agent": "HackIndia-Bot/1.0" },
      });

      const events = Array.isArray(res.data) ? res.data : [];
      logger.info(`[HackClub] Fetched ${events.length} upcoming events`);

      for (const e of events) {
        try {
          const h = this._parse(e);
          if (h) results.push(h);
        } catch (err) {
          logger.warn(`[HackClub] Parse error for "${e.name}": ${err.message}`);
        }
      }
    } catch (err) {
      logger.error(`[HackClub] Fetch failed: ${err.message}`);
    }

    logger.info(`[HackClub] Returning ${results.length} hackathons`);
    return results;
  }

  _parse(e) {
    if (!e.name || !e.website) return null;

    const city = e.virtual ? "Online" : (e.city || "Global");

    let mode = "Online";
    if (e.hybrid)        mode = "Online + Offline";
    else if (!e.virtual) mode = "Offline";

    const tags = [];
    if (e.mlhAssociated) tags.push("MLH");
    if (e.apac)          tags.push("APAC");
    tags.push("Student", "HackClub");

    return this.normalise({
      name:                 e.name.trim(),
      organizer:            "Hack Club",
      mode,
      city,
      state:                e.state  || "",
      country:              e.country || "Global",
      startDate:            e.start,
      endDate:              e.end,
      registrationDeadline: e.start,
      prize:                "TBA",
      tags,
      domains:              [],
      applyLink:            e.website,
      websiteLink:          e.website,
      sourceUrl:            "https://hackathons.hackclub.com",
      externalId:           e.id || e.name,
      logo:                 "🏫",   // Airtable CDN URLs are private — use emoji
      isFeatured:           Boolean(e.mlhAssociated),
    });
  }
}

const _inst = new HackClubScraper();
module.exports = { scrape: () => _inst.scrape() };
