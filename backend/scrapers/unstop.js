/**
 * scrapers/unstop.js — Unstop Hackathons
 * Fixed: API v2 returns 404 — discovered new endpoint via DevTools network tab.
 * Now uses /api/public/opportunity/search-v3 + HTML fallback.
 */
const BaseScraper = require("./base");
const cheerio     = require("cheerio");
const logger      = require("../utils/logger");

class UnstopScraper extends BaseScraper {
  constructor() {
    super("Unstop");
    this.listUrl = "https://unstop.com/hackathons";
    this.apiUrls = [
      "https://unstop.com/api/public/opportunity/search-v3",
      "https://unstop.com/api/public/opportunity/search/v3",
      "https://unstop.com/api/public/opportunity/listing",
      "https://unstop.com/api/public/opportunities",
    ];
  }

  async scrape() {
    logger.info("[Unstop] Starting scrape…");
    const results = [];
    const seen    = new Set();

    // Strategy 1: REST API (try multiple endpoints)
    for (const apiUrl of this.apiUrls) {
      try {
        const res = await this.get(apiUrl, {
          params: { opportunity: "hackathon", deadline: "upcoming", page: 1, size: 50 },
          headers: {
            Accept: "application/json, text/plain, */*",
            Referer: "https://unstop.com/hackathons",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "User-Agent": "Mozilla/5.0 Chrome/125.0.0.0",
          },
          timeout: 20000,
        });
        const body  = res.data;
        const items = body?.data?.data || body?.data || body?.results || body?.opportunities ||
                      (Array.isArray(body) ? body : []);
        if (items.length > 0) {
          logger.info(`[Unstop] API ${apiUrl} → ${items.length} items`);
          for (const item of items) {
            const h = this._parse(item);
            if (h && !seen.has(h.externalId)) { seen.add(h.externalId); results.push(h); }
          }
          if (results.length > 0) { logger.info(`[Unstop] Returning ${results.length}`); return results; }
        }
      } catch (err) {
        logger.warn(`[Unstop] API ${apiUrl} failed: ${err.message}`);
      }
    }

    // Strategy 2: __NEXT_DATA__ from HTML
    try {
      const res   = await this.get(this.listUrl, {
        headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 Chrome/125.0.0.0" },
        timeout: 25000,
      });
      const html  = res.data || "";
      const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (match) {
        const json  = JSON.parse(match[1]);
        const page  = json?.props?.pageProps;
        const items = page?.opportunities || page?.hackathons || page?.data?.opportunities || [];
        logger.info(`[Unstop] __NEXT_DATA__ → ${items.length} items`);
        for (const item of items) {
          const h = this._parse(item);
          if (h && !seen.has(h.externalId)) { seen.add(h.externalId); results.push(h); }
        }
        if (results.length > 0) { logger.info(`[Unstop] Returning ${results.length}`); return results; }
      }

      // Strategy 3: HTML card scraping
      const $     = cheerio.load(html);
      const cards = $("[class*='opportunity'], [class*='hackathon'], [class*='card'], article").toArray();
      logger.info(`[Unstop] HTML cards → ${cards.length}`);
      for (const el of cards) {
        const $el  = $(el);
        const name = $el.find("h2,h3,h4,[class*='title']").first().text().trim();
        if (!name || seen.has(name)) continue;
        const href = $el.find("a[href*='/hackathon'],a[href*='/competition'],a[href]").first().attr("href") || "";
        const link = href.startsWith("http") ? href : href ? `https://unstop.com${href}` : "";
        if (!link) continue;
        seen.add(name);
        results.push(this.normalise({
          name, organizer: $el.find("[class*='org'],[class*='company']").first().text().trim() || "Unstop",
          mode: "Online", city: "Online",
          applyLink: link, sourceUrl: this.listUrl,
          externalId: `unstop-hack-${name.toLowerCase().replace(/\W+/g,"-").slice(0,60)}`,
          logo: "🏆", tags: ["Hackathon", "India"],
        }));
      }
    } catch (err) {
      logger.warn(`[Unstop] HTML failed: ${err.message}`);
    }

    logger.info(`[Unstop] Returning ${results.length} hackathons`);
    return results;
  }

  _parse(item) {
    const title = item.title || item.name || item.opportunity_title || "";
    if (!title) return null;
    const id   = item.id || item._id || item.slug || "";
    const slug = item.slug || item.seo_url || id;
    const link = slug ? `https://unstop.com/hackathons/${slug}` : (item.url || "");
    if (!link) return null;
    return this.normalise({
      name: title.trim(),
      organizer: item.organisation?.name || item.company?.name || item.organizer || "Unstop",
      mode: "Online", city: "Online",
      startDate: item.start_date || item.start_time || null,
      endDate: item.end_date || item.end_time || null,
      registrationDeadline: item.reg_last_date || item.deadline || null,
      prize: item.prize || (item.total_prizes ? `₹${item.total_prizes}` : "TBA"),
      applyLink: link, websiteLink: link, sourceUrl: this.listUrl,
      externalId: `unstop-${String(id || title).slice(0,80)}`,
      logo: item.logo_url || item.image || "🏆",
      tags: ["Hackathon", "India", ...(item.tags || []).map(t => t.name || t).filter(Boolean)],
      registrationCount: Number(item.registrations || item.total_registrations || 0),
    });
  }
}

const _inst = new UnstopScraper();
module.exports = { scrape: () => _inst.scrape() };
