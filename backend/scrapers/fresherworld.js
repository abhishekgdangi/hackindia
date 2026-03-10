/**
 * scrapers/fresherworld.js — Fresherworld (India freshers/internships)
 */
const cheerio     = require("cheerio");
const BaseScraper = require("./base");
const logger      = require("../utils/logger");

class FresherworldScraper extends BaseScraper {
  constructor() {
    super("Fresherworld");
    this.baseUrl = "https://www.fresherworld.com";
    this.urls    = [
      "https://www.fresherworld.com/internship",
      "https://www.fresherworld.com/internship/it-software",
      "https://www.fresherworld.com/internship/computer-science",
    ];
  }

  async scrape() {
    logger.info("[Fresherworld] Starting scrape…");
    const results = [];
    const seen    = new Set();

    for (const url of this.urls) {
      try {
        const res = await this.get(url, {
          timeout: 25000,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0",
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "en-IN,en;q=0.9",
            Referer: "https://www.fresherworld.com",
          },
        });
        const $ = cheerio.load(res.data);

        const cards = $(".job-listing, .job-box, [class*='job-'], [class*='intern'], article, .listing-item").toArray();
        logger.info(`[Fresherworld] ${url} → ${cards.length} cards`);

        for (const el of cards) {
          const $el   = $(el);
          const title = $el.find("h2,h3,h4,a.job-title,[class*='title']").first().text().trim();
          if (!title || title.length < 4 || seen.has(title)) continue;
          const company  = $el.find("[class*='company'],b,[class*='employer']").first().text().trim() || "Company";
          const location = $el.find("[class*='location'],[class*='city']").first().text().trim() || "India";
          const href     = $el.find("a[href*='/job'],a[href*='/intern'],a[href]").first().attr("href") || "";
          const link     = href.startsWith("http") ? href : href ? `https://www.fresherworld.com${href}` : url;
          const stipend  = $el.find("[class*='salary'],[class*='stipend'],[class*='pay']").first().text().trim() || "";

          seen.add(title);
          results.push({
            title, company, location, stipend,
            applyLink: link, sourceUrl: url,
            externalId: `fw-${(title + company).toLowerCase().replace(/\W+/g, "-").slice(0, 80)}`,
            jobType: "Internship", isActive: true, scrapedFrom: "Fresherworld",
            skills: [], duration: "", description: $el.find("p,[class*='desc']").first().text().trim().slice(0, 200),
          });
        }
      } catch (err) {
        logger.warn(`[Fresherworld] ${url} failed: ${err.message}`);
      }
      await this.sleep(1500);
    }

    logger.info(`[Fresherworld] Total: ${results.length}`);
    return results;
  }
}

const _inst = new FresherworldScraper();
module.exports = { scrape: () => _inst.scrape() };
