/**
 * scrapers/twenty19.js — Twenty19 (India's student internship platform)
 * HTML scraping of public listings.
 */
const cheerio     = require("cheerio");
const BaseScraper = require("./base");
const logger      = require("../utils/logger");

class Twenty19Scraper extends BaseScraper {
  constructor() {
    super("Twenty19");
    this.baseUrl = "https://www.twenty19.com";
    this.urls    = [
      "https://www.twenty19.com/internship",
      "https://www.twenty19.com/internship/engineering",
      "https://www.twenty19.com/internship/it-software",
    ];
  }

  async scrape() {
    logger.info("[Twenty19] Starting scrape…");
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
            Referer: "https://www.twenty19.com",
          },
        });
        const $ = cheerio.load(res.data);
        const cards = $(".internship, .job-card, [class*='intern'], [class*='listing'], article, .card").toArray();
        logger.info(`[Twenty19] ${url} → ${cards.length} cards`);

        for (const el of cards) {
          const $el   = $(el);
          const title = $el.find("h2,h3,h4,[class*='title'],[class*='role']").first().text().trim();
          if (!title || title.length < 4 || seen.has(title)) continue;
          const company  = $el.find("[class*='company'],[class*='org'],[class*='employer']").first().text().trim() || "Company";
          const location = $el.find("[class*='location'],[class*='city']").first().text().trim() || "India";
          const href     = $el.find("a[href]").first().attr("href") || "";
          const link     = href.startsWith("http") ? href : href ? `https://www.twenty19.com${href}` : url;
          const stipend  = $el.find("[class*='stipend'],[class*='salary']").first().text().trim() || "";
          seen.add(title);
          results.push({
            title, company, location, stipend,
            applyLink: link, sourceUrl: url,
            externalId: `t19-${(title + company).toLowerCase().replace(/\W+/g, "-").slice(0, 80)}`,
            jobType: "Internship", isActive: true, scrapedFrom: "Twenty19",
            skills: [], description: "",
          });
        }
      } catch (err) {
        logger.warn(`[Twenty19] ${url} failed: ${err.message}`);
      }
      await this.sleep(1500);
    }

    logger.info(`[Twenty19] Total: ${results.length}`);
    return results;
  }
}

const _inst = new Twenty19Scraper();
module.exports = { scrape: () => _inst.scrape() };
