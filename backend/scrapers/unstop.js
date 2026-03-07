/**
 * scrapers/unstop.js
 * Unstop (formerly D2C) — India's #1 hackathon + competition platform
 *
 * Strategy: Unstop is a Next.js SPA. Their page embeds all listing data inside
 * window.__NEXT_DATA__ as a JSON blob. We fetch the HTML, regex-extract the JSON,
 * and parse the opportunity list from it.
 *
 * Fallback: Also tries their internal REST API endpoint discovered via DevTools.
 *
 * ✅ APPROACH: __NEXT_DATA__ extraction (no auth needed)
 */

const BaseScraper = require("./base");
const logger      = require("../utils/logger");

class UnstopScraper extends BaseScraper {
  constructor() {
    super("Unstop");
    this.listUrl = "https://unstop.com/hackathons";
    // Internal API endpoint (discovered via browser DevTools network tab)
    this.apiUrl  = "https://unstop.com/api/public/opportunity/search/v2";
  }

  async scrape() {
    logger.info("[Unstop] Starting scrape…");
    const results = [];

    // ── Strategy 1: Internal REST API (JSON) ─────────────────────────
    try {
      const res = await this.get(this.apiUrl, {
        params: {
          opportunity: "hackathon",
          deadline:    "upcoming",
          page:        1,
          size:        50,
        },
        headers: {
          Accept:          "application/json, text/plain, */*",
          Referer:         "https://unstop.com/hackathons",
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
        },
        timeout: 20000,
      });

      const body = res.data;
      // Unstop wraps data in { data: { data: [...] } } or { data: [...] }
      const items =
        body?.data?.data ||
        body?.data       ||
        body?.results    ||
        (Array.isArray(body) ? body : []);

      logger.info(`[Unstop] API returned ${items.length} items`);
      for (const item of items) {
        const h = this._parse(item);
        if (h) results.push(h);
      }
      if (results.length > 0) return results;
    } catch (err) {
      logger.warn(`[Unstop] API strategy failed: ${err.message} — trying __NEXT_DATA__`);
    }

    // ── Strategy 2: __NEXT_DATA__ extraction from HTML ──────────────
    try {
      const res  = await this.get(this.listUrl, {
        headers: {
          Accept:          "text/html,application/xhtml+xml,*/*",
          "Cache-Control": "no-cache",
        },
        timeout: 25000,
      });

      const html  = res.data || "";
      const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (!match) {
        logger.warn("[Unstop] __NEXT_DATA__ not found in HTML");
        return results;
      }

      const nextData = JSON.parse(match[1]);
      // Drill down to find the opportunities array (path varies by Unstop version)
      const page    = nextData?.props?.pageProps;
      const items   =
        page?.opportunityList     ||
        page?.data?.data          ||
        page?.data                ||
        page?.opportunities       ||
        [];

      logger.info(`[Unstop] __NEXT_DATA__ returned ${items.length} items`);
      for (const item of items) {
        const h = this._parse(item);
        if (h) results.push(h);
      }
    } catch (err) {
      logger.error(`[Unstop] __NEXT_DATA__ strategy failed: ${err.message}`);
    }

    logger.info(`[Unstop] Returning ${results.length} hackathons`);
    return results;
  }

  _parse(item) {
    // Unstop items have various shapes depending on API version
    const title  = item.title || item.name || item.opportunity_name || "";
    const link   = item.public_url || item.url ||
                   (item.id ? `https://unstop.com/hackathons/${item.slug || item.id}` : "");
    if (!title || !link) return null;

    const org    = item.organisation?.name || item.company?.name ||
                   item.organiser_title    || "Unstop";

    const prize  = item.prizes_amount
      ? `₹${item.prizes_amount.toLocaleString("en-IN")}`
      : (item.reward_type === "cash" ? "Cash Prize" : "TBA");

    const start  = item.start_date  || item.event_start_date  || null;
    const end    = item.end_date    || item.event_end_date    || null;
    const regEnd = item.reg_last_date || item.deadline        || null;

    const isOnline  = item.is_online || item.type === "online";
    const city      = isOnline ? "Online" : (item.city || item.location || "India");
    const mode      = isOnline ? "Online" : "Offline";

    const tags = (item.skill_tags || item.tags || []).map(t =>
      typeof t === "string" ? t : t.name || ""
    ).filter(Boolean);

    return this.normalise({
      name:                 title.trim(),
      organizer:            org.trim(),
      mode,
      city,
      state:                item.state  || "",
      country:              item.country || "India",
      startDate:            start,
      endDate:              end,
      registrationDeadline: regEnd,
      prize,
      teamSizeMin:          item.min_team_size || 1,
      teamSizeMax:          item.max_team_size || 4,
      domains:              tags,
      tags:                 [...tags, "India"],
      applyLink:            link,
      websiteLink:          link,
      sourceUrl:            this.listUrl,
      externalId:           String(item.id || title),
      logo:                 item.logo_url || item.thumbnail || "🏆",
      isFeatured:           Boolean(item.is_featured || item.trending),
      registrationCount:    Number(item.reg_count || item.registrations_count || 0),
    });
  }
}

const _inst = new UnstopScraper();
module.exports = { scrape: () => _inst.scrape() };
