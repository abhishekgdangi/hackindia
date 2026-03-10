/**
 * scrapers/letsintern.js — LetsIntern (Indian internship platform)
 * Uses their public listing page HTML scraping.
 */
const cheerio     = require("cheerio");
const BaseScraper = require("./base");
const logger      = require("../utils/logger");

class LetsInternScraper extends BaseScraper {
  constructor() {
    super("LetsIntern");
    this.baseUrl = "https://www.letsintern.com";
    this.urls    = [
      "https://www.letsintern.com/internships/it",
      "https://www.letsintern.com/internships/engineering",
      "https://www.letsintern.com/internships/computer-science",
      "https://www.letsintern.com/internships",
    ];
  }

  async scrape() {
    logger.info("[LetsIntern] Starting scrape…");
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
            Referer: "https://www.letsintern.com",
          },
        });
        const $ = cheerio.load(res.data);

        // LetsIntern card selectors
        const cards = $(".internship-card, [class*='intern-card'], [class*='listing'], .job-listing, article, .card").toArray();
        logger.info(`[LetsIntern] ${url} → ${cards.length} cards`);

        for (const el of cards) {
          const $el   = $(el);
          const title = $el.find("h2,h3,h4,.title,[class*='title'],[class*='role']").first().text().trim();
          if (!title || seen.has(title)) continue;
          const company  = $el.find("[class*='company'],[class*='org'],[class*='employer']").first().text().trim() || "Company";
          const location = $el.find("[class*='location'],[class*='city'],[class*='place']").first().text().trim() || "India";
          const href     = $el.find("a[href]").first().attr("href") || "";
          const link     = href.startsWith("http") ? href : href ? `https://www.letsintern.com${href}` : url;
          const stipend  = $el.find("[class*='stipend'],[class*='salary'],[class*='pay']").first().text().trim() || "";

          seen.add(title);
          results.push(this.normaliseInternship({
            title, company, location, stipend,
            applyLink: link, sourceUrl: url,
            externalId: `letsintern-${(title + company).toLowerCase().replace(/\W+/g, "-").slice(0, 80)}`,
            jobType: "Internship",
          }));
        }
      } catch (err) {
        logger.warn(`[LetsIntern] ${url} failed: ${err.message}`);
      }
      await this.sleep(1200);
    }

    logger.info(`[LetsIntern] Total: ${results.length}`);
    return results;
  }

  normaliseInternship(d) {
    return {
      title:       d.title,
      company:     d.company,
      location:    d.location || "India",
      stipend:     d.stipend  || "As per discussion",
      applyLink:   d.applyLink,
      sourceUrl:   d.sourceUrl,
      externalId:  d.externalId,
      jobType:     "Internship",
      skills:      d.skills   || [],
      duration:    d.duration || "",
      description: d.description || "",
      isActive:    true,
      scrapedFrom: "LetsIntern",
    };
  }
}

const _inst = new LetsInternScraper();
module.exports = { scrape: () => _inst.scrape() };
