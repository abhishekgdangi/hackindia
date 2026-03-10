/**
 * scrapers/mlh.js — Major League Hacking
 * Fixed: URL changed from mlh.io to mlh.com for 2026 season
 */
const BaseScraper = require("./base");
const logger      = require("../utils/logger");
const cheerio     = require("cheerio");

class MLHScraper extends BaseScraper {
  constructor() {
    super("MLH");
    const yr = new Date().getFullYear();
    this.urls = [
      `https://mlh.io/seasons/${yr}/events`,
      `https://www.mlh.com/seasons/${yr}/events`,
      `https://mlh.io/seasons/${yr + 1}/events`,
      `https://www.mlh.com/seasons/${yr + 1}/events`,
    ];
  }

  async scrape() {
    logger.info("[MLH] Starting scrape…");
    const results = [];
    const seen    = new Set();
    const now     = new Date();

    for (const url of this.urls) {
      try {
        const res = await this.get(url, {
          headers: { Accept: "text/html,application/xhtml+xml,*/*", "User-Agent": "Mozilla/5.0 Chrome/125.0.0.0" },
          timeout: 25000,
        });

        const $ = cheerio.load(res.data);
        const cards = $(".event, .event-wrapper, article, [class*='event']").toArray();
        logger.info(`[MLH] ${url} → ${cards.length} raw cards`);

        if (cards.length === 0) continue;

        for (const el of cards) {
          try {
            const $el  = $(el);
            const name = $el.find("h3, h4, .name, .title").first().text().trim();
            if (!name) continue;
            const href = $el.find("a").first().attr("href") || "";
            const link = href.startsWith("http") ? href : href ? `https://mlh.io${href}` : "https://mlh.io";
            const dateText  = $el.find(".date, time, [class*='date']").first().text().trim();
            const cityText  = $el.find(".location, .city, [class*='location']").first().text().trim();
            const modeText  = $el.find("[class*='online'], [class*='hybrid'], [class*='in-person']").first().text().trim();

            if (dateText) {
              const d = new Date(dateText);
              if (!isNaN(d) && d < now) continue;
            }

            const uid = `mlh-${(name + dateText).toLowerCase().replace(/\W+/g, "-").slice(0, 70)}`;
            if (seen.has(uid)) continue;
            seen.add(uid);

            results.push(this.normalise({
              name, organizer: "MLH",
              mode: /online|virtual/i.test(modeText + cityText) ? "Online" : /hybrid/i.test(modeText) ? "Online + Offline" : "Online",
              city: cityText || "Online",
              registrationDeadline: dateText ? new Date(dateText) : null,
              applyLink: link, sourceUrl: url,
              externalId: uid, logo: "🎯",
              description: `MLH Member Event: ${name}`,
            }));
          } catch(_) {}
        }

        if (results.length > 0) break;
      } catch (err) {
        logger.warn(`[MLH] GET ${url} failed: ${err.message}`);
      }
    }

    logger.info(`[MLH] Returning ${results.length} hackathons`);
    return results;
  }
}

module.exports = new MLHScraper();
