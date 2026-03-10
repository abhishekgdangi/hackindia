/**
 * scrapers/hirist.js — Hirist.tech (India tech jobs/internships)
 * Pure HTML scraping — no auth required for public listings.
 */
const cheerio     = require("cheerio");
const BaseScraper = require("./base");
const logger      = require("../utils/logger");

class HiristScraper extends BaseScraper {
  constructor() {
    super("Hirist");
    this.baseUrl = "https://www.hirist.tech";
    this.urls    = [
      "https://www.hirist.tech/jobs/internship",
      "https://www.hirist.tech/jobs/fresher",
      "https://www.hirist.tech/jobs/software-engineer-internship",
    ];
  }

  async scrape() {
    logger.info("[Hirist] Starting scrape…");
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
            Referer: "https://www.hirist.tech",
          },
        });
        const $ = cheerio.load(res.data);

        // Try JSON-LD
        $("script[type='application/ld+json']").each((_, el) => {
          try {
            const data = JSON.parse($(el).html());
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
              if (!["JobPosting", "Internship"].includes(item["@type"])) continue;
              const title = item.title || item.name || "";
              if (!title || seen.has(title)) continue;
              seen.add(title);
              results.push({
                title, company: item.hiringOrganization?.name || "Company",
                location: item.jobLocation?.address?.addressLocality || "India",
                stipend: item.baseSalary?.value?.value ? `₹${item.baseSalary.value.value}` : "",
                applyLink: item.url || url, sourceUrl: url,
                externalId: `hirist-${title.toLowerCase().replace(/\W+/g, "-").slice(0, 80)}`,
                jobType: "Internship", isActive: true, scrapedFrom: "Hirist",
                skills: (item.skills || "").split(",").map(s => s.trim()).filter(Boolean),
                description: item.description || "",
              });
            }
          } catch (_) {}
        });

        // Card scraping
        const cards = $(".job-listing, .job-card, [class*='job-'], [class*='listing'], article").toArray();
        logger.info(`[Hirist] ${url} → ${cards.length} cards`);
        for (const el of cards) {
          const $el   = $(el);
          const title = $el.find("h2,h3,h4,a[class*='title'],[class*='title']").first().text().trim();
          if (!title || title.length < 4 || seen.has(title)) continue;
          const company  = $el.find("[class*='company'],[class*='employer'],b").first().text().trim() || "Company";
          const location = $el.find("[class*='location'],[class*='city']").first().text().trim() || "India";
          const href     = $el.find("a[href]").first().attr("href") || "";
          const link     = href.startsWith("http") ? href : href ? `https://www.hirist.tech${href}` : url;
          seen.add(title);
          results.push({
            title, company, location, stipend: "",
            applyLink: link, sourceUrl: url,
            externalId: `hirist-${(title + company).toLowerCase().replace(/\W+/g, "-").slice(0, 80)}`,
            jobType: "Internship", isActive: true, scrapedFrom: "Hirist",
            skills: [], description: $el.find("p").first().text().trim().slice(0, 200),
          });
        }
      } catch (err) {
        logger.warn(`[Hirist] ${url} failed: ${err.message}`);
      }
      await this.sleep(1500);
    }

    logger.info(`[Hirist] Total: ${results.length}`);
    return results;
  }
}

const _inst = new HiristScraper();
module.exports = { scrape: () => _inst.scrape() };
