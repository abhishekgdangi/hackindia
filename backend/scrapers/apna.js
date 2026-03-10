/**
 * scrapers/apna.js — Apna.co (India jobs/internships, 50M+ users)
 * Uses their public search API discovered from network tab.
 */
const BaseScraper = require("./base");
const cheerio     = require("cheerio");
const logger      = require("../utils/logger");

class ApnaScraper extends BaseScraper {
  constructor() {
    super("Apna");
    this.baseUrl  = "https://apna.co";
    this.apiUrls  = [
      "https://apna.co/api/v1/jobs?category=internship&limit=50",
      "https://apna.co/api/jobs/search?type=internship&limit=50",
      "https://api.apna.co/v1/jobs?type=internship",
    ];
    this.htmlUrls = [
      "https://apna.co/jobs/internship",
      "https://apna.co/jobs/fresher-jobs",
    ];
  }

  async scrape() {
    logger.info("[Apna] Starting scrape…");
    const results = [];
    const seen    = new Set();

    // Strategy 1: API
    for (const url of this.apiUrls) {
      try {
        const res   = await this.get(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0 Chrome/125.0.0.0",
            Referer: "https://apna.co",
          },
          timeout: 15000,
        });
        const items = res.data?.data?.jobs || res.data?.jobs || res.data?.results ||
                      (Array.isArray(res.data) ? res.data : []);
        if (items.length > 0) {
          logger.info(`[Apna] API ${url} → ${items.length}`);
          for (const item of items) {
            const title = item.title || item.job_title || "";
            if (!title || seen.has(title)) continue;
            seen.add(title);
            const company  = item.company?.name || item.employer_name || "Company";
            const location = item.location || item.city || "India";
            const id       = item.id || item.job_id || "";
            const link     = id ? `https://apna.co/jobs/${id}` : this.htmlUrls[0];
            results.push({
              title, company, location,
              stipend: item.salary || item.stipend || "",
              applyLink: link, sourceUrl: url,
              externalId: `apna-${String(id || title).toLowerCase().replace(/\W+/g, "-").slice(0, 80)}`,
              jobType: "Internship", isActive: true, scrapedFrom: "Apna",
              skills: (item.skills || []).map(s => s.name || s).filter(Boolean),
            });
          }
          if (results.length > 0) break;
        }
      } catch (err) {
        logger.warn(`[Apna] API ${url} failed: ${err.message}`);
      }
    }

    // Strategy 2: HTML
    if (results.length === 0) {
      for (const url of this.htmlUrls) {
        try {
          const res = await this.get(url, {
            headers: { "User-Agent": "Mozilla/5.0 Chrome/125.0.0.0", Accept: "text/html" },
            timeout: 25000,
          });
          const $ = cheerio.load(res.data);
          const cards = $("[class*='job'], [class*='card'], article, .listing").toArray();
          logger.info(`[Apna] HTML ${url} → ${cards.length} cards`);
          for (const el of cards) {
            const $el   = $(el);
            const title = $el.find("h2,h3,h4,[class*='title']").first().text().trim();
            if (!title || title.length < 4 || seen.has(title)) continue;
            const company  = $el.find("[class*='company'],[class*='employer']").first().text().trim() || "Company";
            const location = $el.find("[class*='location'],[class*='city']").first().text().trim() || "India";
            const href     = $el.find("a[href]").first().attr("href") || "";
            const link     = href.startsWith("http") ? href : href ? `https://apna.co${href}` : url;
            seen.add(title);
            results.push({
              title, company, location, stipend: "",
              applyLink: link, sourceUrl: url,
              externalId: `apna-${(title + company).toLowerCase().replace(/\W+/g, "-").slice(0, 80)}`,
              jobType: "Internship", isActive: true, scrapedFrom: "Apna",
              skills: [],
            });
          }
          if (results.length > 0) break;
        } catch (err) {
          logger.warn(`[Apna] HTML ${url} failed: ${err.message}`);
        }
      }
    }

    logger.info(`[Apna] Total: ${results.length}`);
    return results;
  }
}

const _inst = new ApnaScraper();
module.exports = { scrape: () => _inst.scrape() };
