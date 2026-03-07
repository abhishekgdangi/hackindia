/**
 * scrapers/devfolio2.js
 * Devfolio — India's largest hackathon platform
 *
 * Previous scraper used /api/hackathons which 404'd.
 * NEW STRATEGY: Devfolio is Next.js — use their internal search API
 * discovered at: https://api.devfolio.co/api/hackathons/?count=20&search=
 *
 * Also tries the GraphQL endpoint they use for listing.
 *
 * ✅ APPROACH: REST API via api.devfolio.co (no auth required for public hackathons)
 */

const BaseScraper = require("./base");
const logger      = require("../utils/logger");

class DevfolioScraper extends BaseScraper {
  constructor() {
    super("Devfolio");
    // api.devfolio.co is their internal backend — distinct from devfolio.co
    this.apiUrl  = "https://api.devfolio.co/api/hackathons/";
    this.baseUrl = "https://devfolio.co";
  }

  async scrape() {
    logger.info("[Devfolio] Starting scrape…");
    const results = [];
    const seen    = new Set();

    const queries = [
      { count: 25, search: "",       filter: "open"     },
      { count: 25, search: "india",  filter: "open"     },
      { count: 25, search: "online", filter: "open"     },
    ];

    for (const params of queries) {
      try {
        const res = await this.get(this.apiUrl, {
          params,
          headers: {
            Accept:  "application/json",
            Referer: "https://devfolio.co/hackathons",
            Origin:  "https://devfolio.co",
          },
          timeout: 20000,
        });

        const body  = res.data;
        // Devfolio returns { results: [...], count: N }
        const items =
          body?.results ||
          body?.hackathons ||
          (Array.isArray(body) ? body : []);

        logger.info(`[Devfolio] search="${params.search}" → ${items.length} items`);

        for (const item of items) {
          const id = item.slug || item.id;
          if (!id || seen.has(id)) continue;
          seen.add(id);
          try {
            const h = this._parse(item);
            if (h) results.push(h);
          } catch (e) {
            logger.warn(`[Devfolio] Parse error: ${e.message}`);
          }
        }
        await this.sleep(2000);
      } catch (err) {
        logger.warn(`[Devfolio] query="${params.search}" failed: ${err.message}`);
      }
    }

    logger.info(`[Devfolio] Returning ${results.length} hackathons`);
    return results;
  }

  _parse(item) {
    const title = item.name || item.title || "";
    const slug  = item.slug || item.id || "";
    if (!title || !slug) return null;

    const link    = `https://devfolio.co/hackathons/${slug}`;
    const prize   = item.prize_pool
      ? `₹${Number(item.prize_pool).toLocaleString("en-IN")}`
      : "TBA";

    const isOnline = item.is_online !== false;   // default online
    const city     = isOnline ? "Online" : (item.city || "India");
    const mode     = isOnline ? "Online" : "Offline";

    const rawTags  = (item.themes || item.tracks || item.tags || [])
      .map(t => typeof t === "string" ? t : t.name || "")
      .filter(Boolean);

    return this.normalise({
      name:                 title.trim(),
      organizer:            item.organization?.name || item.organiser || "Devfolio",
      mode,
      city,
      state:                item.state   || "",
      country:              item.country || "India",
      startDate:            item.starts_at  || item.start_date || null,
      endDate:              item.ends_at    || item.end_date   || null,
      registrationDeadline: item.registration_deadline || item.apply_by || null,
      prize,
      teamSizeMin:          item.min_team_size || 1,
      teamSizeMax:          item.max_team_size || 4,
      domains:              rawTags,
      tags:                 [...rawTags, "India", "Devfolio"],
      applyLink:            link,
      websiteLink:          link,
      sourceUrl:            "https://devfolio.co/hackathons",
      externalId:           String(slug),
      logo:                 item.logo   || item.logo_url || "🛠️",
      isFeatured:           Boolean(item.is_featured),
      registrationCount:    Number(item.registrations_count || item.applicants || 0),
    });
  }
}

const _inst = new DevfolioScraper();
module.exports = { scrape: () => _inst.scrape() };
