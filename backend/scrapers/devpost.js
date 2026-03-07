/**
 * scrapers/devpost.js
 * Devpost — public hackathon API at https://devpost.com/api/hackathons
 */

const BaseScraper = require("./base");
const logger      = require("../utils/logger");

class DevpostScraper extends BaseScraper {
  constructor() {
    super("Devpost");
    this.apiUrl  = "https://devpost.com/api/hackathons";
    this.baseUrl = "https://devpost.com";
  }

  async scrape() {
    logger.info("[Devpost] Starting scrape…");
    const results = [];

    const params = [
      { status: "open", per_page: 50, order_by: "deadline", page: 1 },
      { status: "open", per_page: 50, order_by: "deadline", page: 2 },
      { status: "open", per_page: 30, q: "india",           page: 1 },
    ];

    for (const p of params) {
      try {
        const res  = await this.get(this.apiUrl, {
          params: p,
          headers: { Accept: "application/json" },
        });
        const body  = res.data;
        const items =
          body?.hackathons || body?.results ||
          (Array.isArray(body) ? body : []);

        for (const item of items) {
          const h = this._parse(item);
          if (h) results.push(h);
        }
        logger.info(`[Devpost] page ${p.page} → ${items.length} items`);
        await this.sleep(1500);
      } catch (e) {
        logger.warn(`[Devpost] params ${JSON.stringify(p)} failed: ${e.message}`);
      }
    }

    return this._dedup(results);
  }

  _parse(item) {
    if (!item || item.open_state === "closed") return null;

    const apply =
      item.url ||
      (item.slug ? `${this.baseUrl}/hackathons/${item.slug}` : null);
    if (!apply) return null;

    const deadline =
      item.deadline_to_join          ||
      item.registration_deadline     ||
      item.submission_period_end_date;

    if (deadline && new Date(deadline) < new Date()) return null;

    return this.normalise({
      name:         item.title || "",
      organizer:    item.organization_name || item.organizations?.[0]?.name || "Devpost",
      mode:         item.online_only ? "Online" : item.location ? "Offline" : "Online",
      city:         item.displayed_location?.location || "Online",
      country:      "Global",
      startDate:    item.hackathon_start_date || item.started_at,
      endDate:      item.submission_period_end_date || item.ended_at,
      registrationDeadline: deadline || item.ended_at,
      prize:        item.total_prizes
        ? `$${Number(item.total_prizes).toLocaleString()}`
        : "",
      teamSizeMin:  item.minimum_team_size || 1,
      teamSizeMax:  item.maximum_team_size || 5,
      domains:      item.themes?.map((t) => t.name) || item.tags || [],
      description:  item.tagline || item.description || "",
      applyLink:    `${apply}#prizes`,
      websiteLink:  apply,
      sourceUrl:    `${this.baseUrl}/hackathons`,
      externalId:   String(item.id || item.slug || ""),
      registrationCount: item.registrations_count || 0,
      logo: "🖥️",
    });
  }

  _dedup(arr) {
    const seen = new Set();
    return arr.filter((h) => {
      const k = (h.externalId || h.name || "").toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
}

module.exports = new DevpostScraper();
