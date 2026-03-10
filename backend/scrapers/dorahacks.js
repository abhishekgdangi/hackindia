/**
 * scrapers/dorahacks.js — DoraHacks
 * Fixed: /api/hackathon/list/ returns 404. Now uses correct API discovered from network tab.
 */
const BaseScraper = require("./base");
const cheerio     = require("cheerio");
const logger      = require("../utils/logger");

class DoraHacksScraper extends BaseScraper {
  constructor() {
    super("DoraHacks");
    this.baseUrl = "https://dorahacks.io";
    this.apiUrls = [
      "https://dorahacks.io/api/hackathon",
      "https://dorahacks.io/api/v1/hackathon/list",
      "https://dorahacks.io/api/buidl?type=hackathon&status=open",
      "https://dorahacks.io/api/hackathon?status=open&limit=30&offset=0",
    ];
  }

  async scrape() {
    logger.info("[DoraHacks] Starting scrape…");
    const results = [];
    const seen    = new Set();
    const now     = new Date();

    // Strategy 1: Try all REST API variations
    for (const url of this.apiUrls) {
      try {
        const res   = await this.get(url, {
          headers: {
            Accept: "application/json",
            Referer: "https://dorahacks.io/hackathon",
            Origin: "https://dorahacks.io",
            "User-Agent": "Mozilla/5.0 Chrome/125.0.0.0",
          },
          timeout: 20000,
        });
        const body  = res.data;
        const items = body?.data?.hackathons || body?.hackathons || body?.data ||
                      body?.list || (Array.isArray(body) ? body : []);
        if (items.length > 0) {
          logger.info(`[DoraHacks] API ${url} → ${items.length}`);
          for (const item of items) {
            const h = this._parse(item, now);
            if (h && !seen.has(h.externalId)) { seen.add(h.externalId); results.push(h); }
          }
          if (results.length > 0) break;
        }
      } catch (err) {
        logger.warn(`[DoraHacks] API ${url} failed: ${err.message}`);
      }
    }
    if (results.length > 0) { logger.info(`[DoraHacks] Returning ${results.length}`); return results; }

    // Strategy 2: HTML + __NEXT_DATA__
    try {
      const res = await this.get("https://dorahacks.io/hackathon", {
        headers: {
          "User-Agent": "Mozilla/5.0 Chrome/125.0.0.0",
          Accept: "text/html",
        },
        timeout: 30000,
      });
      const $  = cheerio.load(res.data);
      const nd = $("script#__NEXT_DATA__").html();
      if (nd) {
        const json  = JSON.parse(nd);
        const page  = json?.props?.pageProps;
        const items = page?.hackathons || page?.data?.hackathons || page?.list || [];
        if (items.length > 0) {
          logger.info(`[DoraHacks] NEXT_DATA → ${items.length}`);
          for (const item of items) {
            const h = this._parse(item, now);
            if (h && !seen.has(h.externalId)) { seen.add(h.externalId); results.push(h); }
          }
          return results;
        }
      }
      // Card scraping
      const cards = $("[class*='hackathon'], [class*='card'], article").toArray();
      for (const el of cards) {
        const $el  = $(el);
        const name = $el.find("h2,h3,h4,[class*='title']").first().text().trim();
        if (!name || seen.has(name)) continue;
        const href = $el.find("a[href*='/hackathon/']").first().attr("href") || "";
        const link = href.startsWith("http") ? href : href ? `https://dorahacks.io${href}` : "";
        if (!link) continue;
        seen.add(name);
        results.push(this.normalise({
          name, organizer: "DoraHacks", mode: "Online", city: "Online",
          applyLink: link, sourceUrl: "https://dorahacks.io/hackathon",
          externalId: `dora-${name.toLowerCase().replace(/\W+/g,"-").slice(0,60)}`,
          logo: "🌐", tags: ["Blockchain", "Web3", "Global"],
        }));
      }
    } catch (err) {
      logger.warn(`[DoraHacks] HTML failed: ${err.message}`);
    }

    logger.info(`[DoraHacks] Returning ${results.length} hackathons`);
    return results;
  }

  _parse(item, now) {
    const title = item.title || item.name || "";
    if (!title) return null;
    const id   = item.id || item._id || item.slug || "";
    const link = id ? `https://dorahacks.io/hackathon/${id}` : (item.url || "");
    if (!link) return null;
    const end = item.end_time || item.end_date || null;
    if (end && new Date(end) < now) return null;
    const prizeAmt = item.total_prize || item.prize_pool || item.bounty || 0;
    const prize    = prizeAmt ? `${Number(prizeAmt).toLocaleString()} ${item.prize_currency || "USD"}` : "TBA";
    const rawTags  = [...(item.tags||[]), ...(item.types||[])].map(t => typeof t === "string" ? t : t.name||"").filter(Boolean);
    return this.normalise({
      name: title.trim(), organizer: item.organizer?.name || item.host || "DoraHacks",
      mode: "Online", city: "Online", country: item.country || "Global",
      startDate: item.start_time || item.start_date,
      endDate: end, registrationDeadline: item.register_end_time || item.reg_deadline || end,
      prize, teamSizeMin: item.min_team_size || 1, teamSizeMax: item.max_team_size || 5,
      domains: rawTags, tags: [...rawTags, "Web3", "Global"],
      applyLink: link, websiteLink: link, sourceUrl: "https://dorahacks.io/hackathon",
      externalId: `dora-${String(id || title).slice(0,80)}`,
      logo: item.logo || item.logo_url || item.cover_img || "🌐",
      isFeatured: Boolean(item.featured || item.is_featured),
      registrationCount: Number(item.participant_count || item.participants || 0),
    });
  }
}

const _inst = new DoraHacksScraper();
module.exports = { scrape: () => _inst.scrape() };
