/**
 * scrapers/taikai.js — TAIKAI
 * Fixed: API is GraphQL-based. Use proper HTML scraping with __NEXT_DATA__ + multiple selectors.
 */
const BaseScraper = require("./base");
const cheerio     = require("cheerio");
const logger      = require("../utils/logger");

class TAIKAIScraper extends BaseScraper {
  constructor() {
    super("TAIKAI");
    this.baseUrl = "https://taikai.network";
    this.urls    = [
      "https://taikai.network/hackathons",
      "https://taikai.network/hackathons?tab=open",
      "https://taikai.network/en/hackathons",
    ];
  }

  async scrape() {
    logger.info("[TAIKAI] Starting scrape…");
    const results = [];
    const seen    = new Set();
    const now     = new Date();

    // Try GraphQL endpoint used by their Next.js frontend
    try {
      const res = await this.get("https://taikai.network/api/graphql", {
        method: "post",
        data: JSON.stringify({
          operationName: "GetHackathons",
          variables: { first: 30, status: "OPEN" },
          query: `query GetHackathons($first:Int $status:String){hackathons(first:$first status:$status){nodes{id name slug description startDate endDate url coverImage{url}participants{totalCount}}}}`,
        }),
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Origin: "https://taikai.network",
          Referer: "https://taikai.network/hackathons",
          "User-Agent": "Mozilla/5.0 Chrome/125.0.0.0",
        },
        timeout: 15000,
      });
      const items = res.data?.data?.hackathons?.nodes || [];
      if (items.length > 0) {
        logger.info(`[TAIKAI] GraphQL → ${items.length} items`);
        for (const item of items) {
          const h = this._parseGql(item);
          if (h && !seen.has(h.externalId)) { seen.add(h.externalId); results.push(h); }
        }
        return results;
      }
    } catch (e) {
      logger.warn(`[TAIKAI] GraphQL failed: ${e.message}`);
    }

    // HTML fallback with multiple selectors
    for (const url of this.urls) {
      try {
        const res = await this.get(url, {
          headers: { "User-Agent": "Mozilla/5.0 Chrome/125.0.0.0", Accept: "text/html" },
          timeout: 25000,
        });
        const $ = cheerio.load(res.data);

        // Try __NEXT_DATA__
        const nd = $("script#__NEXT_DATA__").html();
        if (nd) {
          try {
            const json  = JSON.parse(nd);
            const page  = json?.props?.pageProps;
            const items = page?.hackathons || page?.challenges || page?.data?.hackathons ||
                          page?.initialData?.hackathons || [];
            if (items.length > 0) {
              logger.info(`[TAIKAI] __NEXT_DATA__ ${url} → ${items.length}`);
              for (const item of items) {
                const h = this._parseJson(item, now);
                if (h && !seen.has(h.externalId)) { seen.add(h.externalId); results.push(h); }
              }
              if (results.length > 0) break;
            }
          } catch (_) {}
        }

        // Card scraping
        const cards = $("article, [class*='hackathon'], [class*='challenge'], [class*='card'], .grid > div").toArray();
        logger.info(`[TAIKAI] HTML ${url} → ${cards.length} raw cards`);
        for (const el of cards) {
          const $el  = $(el);
          const name = $el.find("h2,h3,h4,[class*='title'],[class*='name']").first().text().trim();
          if (!name || name.length < 3 || seen.has(name)) continue;
          const href = $el.find("a[href*='/hackathon'],a[href*='/challenge'],a[href]").first().attr("href") || "";
          const link = href.startsWith("http") ? href : href ? `https://taikai.network${href}` : "";
          if (!link) continue;
          seen.add(name);
          results.push(this.normalise({
            name, organizer: "TAIKAI", mode: "Online", city: "Online", country: "Global",
            applyLink: link, websiteLink: link,
            sourceUrl: url, externalId: `taikai-${name.toLowerCase().replace(/\W+/g,"-").slice(0,60)}`,
            logo: "🌐", tags: ["Blockchain", "Web3", "Global"],
            description: $el.find("[class*='desc'],p").first().text().trim() || "",
          }));
        }
        if (results.length > 0) break;
      } catch (err) {
        logger.warn(`[TAIKAI] HTML ${url} failed: ${err.message}`);
      }
    }

    logger.info(`[TAIKAI] Total: ${results.length}`);
    return results;
  }

  _parseGql(item) {
    if (!item.name) return null;
    const slug = item.slug || item.id;
    const link = `https://taikai.network/hackathons/${slug}`;
    return this.normalise({
      name: item.name.trim(), organizer: "TAIKAI", mode: "Online", city: "Online",
      startDate: item.startDate, endDate: item.endDate,
      applyLink: item.url || link, websiteLink: link,
      sourceUrl: "https://taikai.network/hackathons",
      externalId: `taikai-${slug}`, logo: item.coverImage?.url || "🌐",
      tags: ["Blockchain", "Web3", "Global"], registrationCount: item.participants?.totalCount || 0,
      description: item.description || "",
    });
  }

  _parseJson(item, now) {
    const name = item.name || item.title || "";
    if (!name) return null;
    const slug = item.slug || item.id || "";
    const link = `https://taikai.network/hackathons/${slug}`;
    const end  = item.endDate || item.end_date || null;
    if (end && new Date(end) < now) return null;
    return this.normalise({
      name: name.trim(), organizer: "TAIKAI", mode: "Online", city: "Online",
      startDate: item.startDate || item.start_date,
      endDate: end, applyLink: link, sourceUrl: "https://taikai.network/hackathons",
      externalId: `taikai-${slug || name.toLowerCase().replace(/\W+/g,"-")}`,
      logo: item.coverImage?.url || item.thumbnail || "🌐", tags: ["Web3", "Global"],
    });
  }

  _dedup(arr) {
    const seen = new Set();
    return arr.filter(h => { if (seen.has(h.externalId)) return false; seen.add(h.externalId); return true; });
  }
}

const _inst = new TAIKAIScraper();
module.exports = { scrape: () => _inst.scrape() };
