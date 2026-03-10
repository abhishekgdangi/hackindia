/**
 * scrapers/devfolio2.js — Devfolio (India's largest hackathon platform)
 * Fixed: api.devfolio.co returns 422 — now uses HTML scraping with multiple strategies.
 * Devfolio is React-based; data lives in <script> tags and JSON-LD.
 */
const BaseScraper = require("./base");
const cheerio     = require("cheerio");
const logger      = require("../utils/logger");

class DevfolioScraper extends BaseScraper {
  constructor() {
    super("Devfolio");
    this.baseUrl = "https://devfolio.co";
    this.urls    = [
      "https://devfolio.co/hackathons/open",
      "https://devfolio.co/hackathons",
    ];
  }

  async scrape() {
    logger.info("[Devfolio] Starting scrape…");
    const results = [];
    const seen    = new Set();
    const now     = new Date();

    // Strategy 1: Try Devfolio's public search API (discovered from their frontend bundle)
    const apiEndpoints = [
      "https://api.devfolio.co/api/search/hackathons",
      "https://api.devfolio.co/api/hackathons/search",
      "https://api.devfolio.co/api/hackathons?status=open&limit=30",
    ];
    for (const url of apiEndpoints) {
      try {
        const res   = await this.get(url, {
          params: { status: "open", limit: 30 },
          headers: {
            Accept: "application/json",
            Origin: "https://devfolio.co",
            Referer: "https://devfolio.co/hackathons",
            "User-Agent": "Mozilla/5.0 Chrome/125.0.0.0",
          },
          timeout: 15000,
        });
        const items = res.data?.results || res.data?.hackathons || res.data?.data ||
                      (Array.isArray(res.data) ? res.data : []);
        if (items.length > 0) {
          logger.info(`[Devfolio] API ${url} → ${items.length}`);
          for (const item of items) {
            const h = this._parseApi(item, now);
            if (h && !seen.has(h.externalId)) { seen.add(h.externalId); results.push(h); }
          }
          if (results.length > 0) break;
        }
      } catch (e) {
        logger.warn(`[Devfolio] API ${url} failed: ${e.message}`);
      }
    }
    if (results.length > 0) { logger.info(`[Devfolio] Returning ${results.length}`); return results; }

    // Strategy 2: HTML page scraping
    for (const url of this.urls) {
      try {
        const res = await this.get(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0",
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "en-IN,en;q=0.9",
            Referer: "https://devfolio.co",
          },
          timeout: 30000,
        });
        const $ = cheerio.load(res.data);

        // Try JSON-LD
        $("script[type='application/ld+json']").each((_, el) => {
          try {
            const data = JSON.parse($(el).html());
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
              if (item["@type"] !== "Hackathon" && item["@type"] !== "Event") continue;
              const name = item.name || "";
              if (!name || seen.has(name)) continue;
              const link = item.url || item["@id"] || "";
              seen.add(name);
              results.push(this.normalise({
                name, organizer: item.organizer?.name || "Devfolio",
                mode: "Online", city: item.location?.name || "Online",
                startDate: item.startDate, endDate: item.endDate,
                applyLink: link, sourceUrl: url,
                externalId: `devfolio-${name.toLowerCase().replace(/\W+/g,"-").slice(0,60)}`,
                logo: "🚀", tags: ["Hackathon", "India"],
                description: item.description || "",
              }));
            }
          } catch (_) {}
        });

        // Card scraping
        const selectors = [
          "[class*='HackathonCard'], [class*='hackathon-card']",
          "[data-testid*='hackathon'], [data-testid*='card']",
          "article", ".card", "[class*='Card']",
        ];
        for (const sel of selectors) {
          const cards = $(sel).toArray();
          if (cards.length < 2) continue;
          logger.info(`[Devfolio] ${url} selector "${sel}" → ${cards.length} cards`);
          for (const el of cards) {
            const $el  = $(el);
            const name = $el.find("h1,h2,h3,h4,[class*='title'],[class*='name']").first().text().trim();
            if (!name || name.length < 3 || seen.has(name)) continue;
            const href = $el.find("a[href*='/hackathon'],a[href]").first().attr("href") || "";
            const link = href.startsWith("http") ? href : href ? `https://devfolio.co${href}` : "";
            seen.add(name);
            results.push(this.normalise({
              name, organizer: "Devfolio", mode: "Online", city: "Online",
              applyLink: link || `https://devfolio.co/hackathons`, sourceUrl: url,
              externalId: `devfolio-${name.toLowerCase().replace(/\W+/g,"-").slice(0,60)}`,
              logo: "🚀", tags: ["Hackathon", "India"],
            }));
          }
          if (results.length > 0) break;
        }
        if (results.length > 0) break;
      } catch (err) {
        logger.warn(`[Devfolio] HTML ${url} failed: ${err.message}`);
      }
    }

    logger.info(`[Devfolio] Returning ${results.length} hackathons`);
    return results;
  }

  _parseApi(item, now) {
    const name = item.name || item.title || "";
    if (!name) return null;
    const slug = item.slug || item.id || name.toLowerCase().replace(/\W+/g, "-");
    const link = `https://devfolio.co/${slug}`;
    const end  = item.ends_at || item.end_date || null;
    if (end && new Date(end) < now) return null;
    return this.normalise({
      name: name.trim(), organizer: item.organizer?.name || "Devfolio",
      mode: "Online", city: "Online",
      startDate: item.starts_at || item.start_date,
      endDate: end, registrationDeadline: item.application_deadline || end,
      prize: item.prize || (item.prize_pool ? `₹${item.prize_pool}` : "TBA"),
      applyLink: link, websiteLink: link, sourceUrl: "https://devfolio.co/hackathons",
      externalId: `devfolio-${slug.slice(0,70)}`,
      logo: item.cover_image || item.logo || "🚀",
      tags: ["Hackathon", "India"],
      registrationCount: Number(item.total_registrations || 0),
      description: item.tagline || item.description || "",
    });
  }
}

const _inst = new DevfolioScraper();
module.exports = { scrape: () => _inst.scrape() };
