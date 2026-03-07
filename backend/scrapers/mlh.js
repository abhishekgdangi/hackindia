/**
 * scrapers/mlh.js
 * Major League Hacking (MLH) — Official student hackathon league
 *
 * Strategy: MLH renders their seasons page as server-side HTML with
 * structured event cards. We parse them with cheerio.
 * URL: https://mlh.io/seasons/2025/events
 *
 * ✅ APPROACH: HTML scraping with cheerio (SSR page — data in HTML)
 */

const BaseScraper = require("./base");
const logger      = require("../utils/logger");
const cheerio     = require("cheerio");

class MLHScraper extends BaseScraper {
  constructor() {
    super("MLH");
    // Try current year + next year seasons
    const yr  = new Date().getFullYear();
    this.urls = [
      `https://mlh.io/seasons/${yr}/events`,
      `https://mlh.io/seasons/${yr + 1}/events`,
    ];
  }

  async scrape() {
    logger.info("[MLH] Starting scrape…");
    const results = [];
    const seen    = new Set();

    for (const url of this.urls) {
      try {
        const res  = await this.get(url, {
          headers: {
            Accept:          "text/html,application/xhtml+xml,*/*",
            "Cache-Control": "no-cache",
          },
          timeout: 25000,
        });

        const $ = cheerio.load(res.data);

        // MLH event cards — selector based on their HTML structure
        // Each event is in a div.event or article.event or similar
        const cards = $(".event, .event-wrapper, [class*='event-item'], article").toArray();

        logger.info(`[MLH] ${url} → ${cards.length} raw cards`);

        for (const el of cards) {
          try {
            const h = this._parseCard($, el, url);
            if (h && !seen.has(h.externalId)) {
              seen.add(h.externalId);
              results.push(h);
            }
          } catch (e) {
            logger.warn(`[MLH] Card parse error: ${e.message}`);
          }
        }

        await this.sleep(2000);
      } catch (err) {
        logger.warn(`[MLH] Failed to fetch ${url}: ${err.message}`);
      }
    }

    logger.info(`[MLH] Returning ${results.length} hackathons`);
    return results;
  }

  _parseCard($, el, sourceUrl) {
    const $el = $(el);

    // Name
    const name =
      $el.find("h3, h2, .event-name, .title, [class*='name']").first().text().trim() ||
      $el.find("a").first().text().trim();
    if (!name || name.length < 3) return null;

    // Link
    let link =
      $el.find("a.event-link, a[href*='mlh.io'], a").first().attr("href") ||
      $el.attr("data-url") || "";
    if (link && !link.startsWith("http")) link = "https://mlh.io" + link;
    if (!link) return null;

    // Date text — try various selectors
    const dateTxt =
      $el.find(".event-date, .date, time, [class*='date']").first().text().trim() || "";

    // Location
    const locTxt =
      $el.find(".event-location, .location, [class*='location']").first().text().trim() || "";

    const isOnline = /online|virtual|digital/i.test(locTxt) || /online/i.test($el.text());
    const city     = isOnline ? "Online" : (locTxt.split(",")[0].trim() || "Global");
    const mode     = isOnline ? "Online" : "Offline";

    // Image / logo
    const logo = $el.find("img").first().attr("src") || "🎓";

    // Try to parse date
    let startDate = null;
    if (dateTxt) {
      const parsed = new Date(dateTxt.replace(/–.*/,"").trim());
      if (!isNaN(parsed)) startDate = parsed;
    }

    return this.normalise({
      name,
      organizer:            "MLH",
      mode,
      city,
      state:                "",
      country:              isOnline ? "Global" : (locTxt.split(",").pop().trim() || "Global"),
      startDate,
      endDate:              null,
      registrationDeadline: startDate,
      prize:                "TBA",
      tags:                 ["MLH", "Student", "Hackathon"],
      domains:              [],
      applyLink:            link,
      websiteLink:          link,
      sourceUrl,
      externalId:           link,
      logo,
      isFeatured:           true,
    });
  }
}

const _inst = new MLHScraper();
module.exports = { scrape: () => _inst.scrape() };
