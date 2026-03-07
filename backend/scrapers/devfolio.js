/**
 * scrapers/devfolio.js
 * Devfolio — India's #1 hackathon platform.
 * Fixed: 422 was caused by missing required headers. Now uses correct API format.
 */
const BaseScraper = require("./base");
const logger      = require("../utils/logger");

class DevfolioScraper extends BaseScraper {
  constructor() {
    super("Devfolio");
    this.rest    = "https://api.devfolio.co/api/search/hackathons";
    this.baseUrl = "https://devfolio.co";
  }

  async scrape() {
    logger.info("[Devfolio] Starting scrape…");
    const now     = new Date();
    const results = [];

    const queries = [
      { q: "", page: 0, per_page: 20, filter: "open" },
      { q: "", page: 1, per_page: 20, filter: "open" },
      { q: "india", page: 0, per_page: 20, filter: "open" },
      { q: "", page: 0, per_page: 20, filter: "upcoming" },
    ];

    for (const params of queries) {
      try {
        const res = await this.get(this.rest, {
          params,
          timeout: 15000,
          headers: {
            Accept:             "application/json, text/plain, */*",
            "Content-Type":     "application/json",
            Referer:            "https://devfolio.co/hackathons",
            Origin:             "https://devfolio.co",
            "X-Requested-With": "XMLHttpRequest",
            "sec-fetch-site":   "same-origin",
            "sec-fetch-mode":   "cors",
          },
        });

        const body  = res.data;
        const items =
          body?.results          ||
          body?.hackathons       ||
          body?.data?.hackathons ||
          (Array.isArray(body) ? body : []);

        let added = 0;
        for (const item of items) {
          const h = this._parse(item, now);
          if (h) { results.push(h); added++; }
        }
        logger.info(`[Devfolio] q="${params.q}" page=${params.page} → ${added}`);
        await this.sleep(1500);
      } catch (e) {
        logger.warn(`[Devfolio] params ${JSON.stringify(params)} failed: ${e.message}`);
      }
    }

    const unique = this._dedup(results);
    logger.info(`[Devfolio] Total: ${unique.length}`);
    return unique;
  }

  _parse(item, now = new Date()) {
    if (!item) return null;
    const deadline =
      item.ends_at || item.registration_ends_at || item.submission_deadline;
    if (deadline && new Date(deadline) < now) return null;

    const slug  = item.slug || "";
    const apply = item.url || (slug ? `${this.baseUrl}/hackathons/${slug}` : null);
    const name  = item.name || item.title || "";
    if (!apply || !name) return null;

    const loc    = item.location || item.city || "";
    const online = item.is_online_only !== false && (!loc || loc.toLowerCase() === "online");
    const setting = item.hackathon_setting || {};

    return this.normalise({
      name,
      organizer:   item.team?.name || item.organizer || "Devfolio",
      mode:        online ? "Online" : "Offline",
      city:        online ? "Online" : (loc || "India"),
      country:     online ? "Global" : "India",
      startDate:   item.starts_at || setting.starts_at,
      endDate:     item.ends_at   || setting.ends_at,
      registrationDeadline: deadline || this._futureDate(21),
      prize:       setting.prizes || item.prize || "TBA",
      teamSizeMin: setting.min_team_size || 1,
      teamSizeMax: setting.max_team_size || 4,
      domains:     item.tags || [],
      description: item.description || item.tagline || "",
      applyLink:   apply,
      sourceUrl:   `${this.baseUrl}/hackathons`,
      externalId:  String(item.id || slug || ""),
      registrationCount: item.applications_count || 0,
      logo:        "🚀",
    });
  }

  _dedup(arr) {
    const seen = new Set();
    return arr.filter(h => {
      const k = (h.externalId || h.name).toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
  }
}

module.exports = new DevfolioScraper();
