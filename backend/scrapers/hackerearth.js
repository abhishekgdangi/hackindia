/**
 * scrapers/hackerearth.js — HackerEarth Challenges
 * Fixed: API endpoint changed. Now uses correct v4 endpoint + HTML fallback.
 */
const BaseScraper = require("./base");
const cheerio     = require("cheerio");
const logger      = require("../utils/logger");

class HackerEarthScraper extends BaseScraper {
  constructor() {
    super("HackerEarth");
    this.baseUrl = "https://www.hackerearth.com";
    this.apiUrls = [
      "https://www.hackerearth.com/api/v4/challenges/?type=hackathon&status=ongoing,upcoming&limit=50",
      "https://www.hackerearth.com/api/v3/challenges/?type=hackathon&limit=50",
      "https://www.hackerearth.com/api/v2/challenges/?type=hackathon&limit=50",
      "https://www.hackerearth.com/challenges/data/?type=hackathon",
    ];
    this.htmlUrls = ["https://www.hackerearth.com/challenges/", "https://www.hackerearth.com/challenges/hackathon/", "https://www.hackerearth.com/hackathon/"];
  }

  async scrape() {
    logger.info("[HackerEarth] Starting scrape…");
    const results = [];
    const seen    = new Set();
    const now     = new Date();

    // Strategy 1: Try all API endpoints
    for (const url of this.apiUrls) {
      try {
        const res   = await this.get(url, {
          headers: {
            Accept: "application/json",
            Referer: "https://www.hackerearth.com/challenges/",
            "User-Agent": "Mozilla/5.0 Chrome/125.0.0.0",
          },
          timeout: 20000,
        });
        const body  = res.data;
        const items = body?.results || body?.response?.hackathons || body?.hackathons ||
                      body?.challenges || body?.data || (Array.isArray(body) ? body : []);
        if (items.length > 0) {
          logger.info(`[HackerEarth] API ${url} → ${items.length}`);
          for (const item of items) {
            const h = this._parse(item, now);
            if (h && !seen.has(h.externalId)) { seen.add(h.externalId); results.push(h); }
          }
          if (results.length > 0) break;
        }
      } catch (err) {
        logger.warn(`[HackerEarth] API ${url} failed: ${err.message}`);
      }
    }
    if (results.length > 0) { logger.info(`[HackerEarth] Returning ${results.length}`); return results; }

    // Strategy 2: HTML scraping
    try {
      const htmlUrl = "https://www.hackerearth.com/challenges/hackathon/";
      const res = await this.get(htmlUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 Chrome/125.0.0.0",
          Accept: "text/html",
          Referer: "https://www.hackerearth.com/challenges/",
        },
        timeout: 25000,
      });
      const $ = cheerio.load(res.data);

      // Check for JSON data in script
      $("script").each((_, el) => {
        const text = $(el).html() || "";
        if (!text.includes("hackathon") && !text.includes("challenge")) return;
        const match = text.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/);
        if (!match) return;
        try {
          const state = JSON.parse(match[1]);
          const items = state?.challenges?.list || state?.hackathons || [];
          for (const item of items) {
            const h = this._parse(item, now);
            if (h && !seen.has(h.externalId)) { seen.add(h.externalId); results.push(h); }
          }
        } catch (_) {}
      });

      if (results.length > 0) { logger.info(`[HackerEarth] Returning ${results.length}`); return results; }

      // Card scraping fallback
      const cards = $(
        ".challenge-card, .challenge-list-card, [class*='challenge-card'], [class*='challenge-list'], " +
        "[class*='hackathon'], article, .card, [data-type='hackathon'], li.challenge"
      ).toArray();
      logger.info(`[HackerEarth] HTML cards → ${cards.length}`);
      for (const el of cards) {
        const $el  = $(el);
        const name = $el.find("h2,h3,h4,.title,[class*='title']").first().text().trim();
        if (!name || seen.has(name)) continue;
        const href = $el.find("a[href*='/challenges/']").first().attr("href") || "";
        const link = href.startsWith("http") ? href : href ? `https://www.hackerearth.com${href}` : "";
        if (!link) continue;
        seen.add(name);
        results.push(this.normalise({
          name, organizer: "HackerEarth", mode: "Online", city: "Online",
          applyLink: link, sourceUrl: htmlUrl || this.htmlUrls?.[0] || '',
          externalId: `he-${name.toLowerCase().replace(/\W+/g,"-").slice(0,60)}`,
          logo: "💻", tags: ["Hackathon", "Coding"],
        }));
      }
    } catch (err) {
      logger.warn(`[HackerEarth] HTML failed: ${err.message}`);
    }

    logger.info(`[HackerEarth] Returning ${results.length} hackathons`);
    return results;
  }

  _parse(item, now) {
    const title = item.title || item.name || item.challenge_name || "";
    if (!title) return null;
    const slug  = item.slug || item.url_path || item.challenge_url_path || "";
    const link  = slug
      ? `https://www.hackerearth.com/challenges/hackathon/${slug}/`
      : (item.url || item.challenge_url || "");
    if (!link) return null;
    const end = item.end_time || item.end_date || item.ends_at || null;
    if (end && new Date(end) < now) return null;
    const tags = (item.tags || item.skills || item.domains || []).map(t =>
      typeof t === "string" ? t : t.name || "").filter(Boolean);
    return this.normalise({
      name: title.trim(),
      organizer: item.company?.name || item.organisation_name || "HackerEarth",
      mode: "Online", city: "Online",
      startDate: item.start_time || item.start_date || null,
      endDate: end, registrationDeadline: item.reg_end_time || end,
      prize: item.prize || (item.prize_amount ? `$${item.prize_amount}` : "TBA"),
      tags: [...tags, "Coding"], domains: tags,
      applyLink: link, websiteLink: link, sourceUrl: htmlUrl || this.htmlUrls?.[0] || '',
      externalId: `he-${String(item.id || item.slug || title).slice(0,70)}`,
      logo: item.logo || item.cover_image || "💻",
      isFeatured: Boolean(item.is_featured),
      registrationCount: Number(item.num_participants || 0),
    });
  }
}

const _inst = new HackerEarthScraper();
module.exports = { scrape: () => _inst.scrape() };
