/**
 * scrapers/hackerearth.js
 * HackerEarth Challenges — coding challenges + hackathons
 *
 * Strategy: HackerEarth exposes a public REST API at /api/v3/ that returns
 * JSON for their public challenge listings. Discovered via DevTools inspection.
 *
 * Endpoint: GET https://www.hackerearth.com/api/v3/events/?limit=50
 *
 * ✅ APPROACH: Direct REST API (JSON) — no auth required for public events
 */

const BaseScraper = require("./base");
const logger      = require("../utils/logger");

class HackerEarthScraper extends BaseScraper {
  constructor() {
    super("HackerEarth");
    this.apiUrl  = "https://www.hackerearth.com/api/v3/events/";
    this.baseUrl = "https://www.hackerearth.com";
  }

  async scrape() {
    logger.info("[HackerEarth] Starting scrape…");
    const results = [];

    const pages = [
      { type: "hackathon", limit: 50, offset: 0 },
      { type: "hackathon", limit: 50, offset: 50 },
    ];

    for (const params of pages) {
      try {
        const res = await this.get(this.apiUrl, {
          params,
          headers: {
            Accept:   "application/json",
            Referer:  "https://www.hackerearth.com/challenges/",
          },
          timeout: 20000,
        });

        // Response shape: { response: { hackathons: [...] } } or { hackathons: [...] }
        const body  = res.data;
        const items =
          body?.response?.hackathons ||
          body?.hackathons           ||
          body?.results              ||
          (Array.isArray(body) ? body : []);

        logger.info(`[HackerEarth] offset=${params.offset} → ${items.length} items`);

        for (const item of items) {
          try {
            const h = this._parse(item);
            if (h) results.push(h);
          } catch (e) {
            logger.warn(`[HackerEarth] Parse error: ${e.message}`);
          }
        }

        // If less than limit returned, no more pages
        if (items.length < params.limit) break;
        await this.sleep(1500);

      } catch (err) {
        logger.warn(`[HackerEarth] offset=${params.offset} failed: ${err.message}`);
        break;
      }
    }

    logger.info(`[HackerEarth] Returning ${results.length} hackathons`);
    return results;
  }

  _parse(item) {
    const title = item.title || item.name || "";
    if (!title) return null;

    const slug  = item.slug || item.url_path || "";
    const link  = slug
      ? `https://www.hackerearth.com/challenges/hackathon/${slug}/`
      : (item.url || item.challenge_url || "");
    if (!link) return null;

    const prize =
      item.prize         ||
      (item.prize_amount ? `$${item.prize_amount}` : "TBA");

    const start  = item.start_time  || item.start_date  || null;
    const end    = item.end_time    || item.end_date    || null;
    const regEnd = item.reg_end_time || end             || null;

    const tags   = (item.tags || item.skills || []).map(t =>
      typeof t === "string" ? t : t.name || ""
    ).filter(Boolean);

    return this.normalise({
      name:                 title.trim(),
      organizer:            item.company?.name || item.organization || "HackerEarth",
      mode:                 "Online",
      city:                 "Online",
      state:                "",
      country:              "Global",
      startDate:            start,
      endDate:              end,
      registrationDeadline: regEnd,
      prize,
      teamSizeMin:          item.min_team_size || 1,
      teamSizeMax:          item.max_team_size || 4,
      domains:              tags,
      tags:                 [...tags, "Coding"],
      applyLink:            link,
      websiteLink:          link,
      sourceUrl:            "https://www.hackerearth.com/challenges/",
      externalId:           String(item.id || item.slug || title),
      logo:                 item.logo        ||
                            item.cover_image  || "💻",
      isFeatured:           Boolean(item.is_featured),
      registrationCount:    Number(item.num_participants || 0),
    });
  }
}

const _inst = new HackerEarthScraper();
module.exports = { scrape: () => _inst.scrape() };
