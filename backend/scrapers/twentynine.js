/**
 * scrapers/twentynine.js
 * Twenty19 (Superset) — India's campus internship and job platform.
 * Public HTML listing, no WAF, India-focused.
 * URL: https://app.superset.ai/internships OR https://www.twenty19.com
 */
const cheerio     = require("cheerio");
const BaseScraper = require("./base");
const logger      = require("../utils/logger");

class TwentyNineScraper extends BaseScraper {
  constructor() {
    super("Twenty19");
    this.urls = [
      "https://www.twenty19.com/internships",
      "https://www.twenty19.com/jobs?type=internship",
      "https://app.superset.ai/opportunities?type=internship",
    ];
  }

  async scrape() {
    logger.info("[Twenty19] Starting scrape…");
    const results = [];

    for (const url of this.urls) {
      try {
        const res = await this.get(url, {
          timeout: 20000,
          headers: {
            "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0",
            Accept:            "text/html,application/xhtml+xml",
            "Accept-Language": "en-IN,en;q=0.9",
            Referer:           "https://www.twenty19.com",
          },
        });

        const $   = cheerio.load(res.data);
        let added = 0;

        // Try embedded JSON
        const scripts = $("script[type='application/json'],script#__NEXT_DATA__");
        scripts.each((_, el) => {
          if (added > 0) return;
          try {
            const json = JSON.parse($(el).html() || "{}");
            const data = json?.props?.pageProps?.internships
                      || json?.props?.pageProps?.jobs
                      || json?.data || [];
            if (Array.isArray(data)) {
              for (const item of data) {
                const role = item.title || item.role || item.position || "";
                if (!role) continue;
                results.push({
                  company:   item.company?.name || item.company || "Company",
                  role,
                  logo:      this._logo(item.company?.name || item.company || ""),
                  stipend:   item.stipend || "Stipend on application",
                  stipendNumeric: 0,
                  duration:  item.duration || "3 months",
                  location:  item.location || item.city || "India",
                  isRemote:  item.is_remote || false,
                  skills:    item.skills || item.tags || [],
                  applyLink: item.url || item.apply_link || url,
                  deadline:  this._futureDate(30),
                  description: (item.description || "").slice(0, 300),
                  sourcePlatform: "Twenty19",
                  status:    "OPEN", isActive: true,
                  lastScrapedAt: new Date(),
                });
                added++;
              }
            }
          } catch (_) {}
        });

        // HTML fallback
        if (added === 0) {
          $(".internship-card,.job-card,.opportunity,.card,article,[class*='intern'],[class*='opport']").each((_, el) => {
            try {
              const $el     = $(el);
              const role    = $el.find("h2,h3,h4,.title,[class*='title']").first().text().trim();
              const company = $el.find(".company,[class*='company']").first().text().trim();
              if (!role || role.length < 3) return;
              const href    = $el.find("a[href]").first().attr("href") || "";
              const apply   = href.startsWith("http") ? href :
                href ? `https://www.twenty19.com${href}` : url;
              results.push({
                company:   company || "Company",
                role,
                logo:      this._logo(company),
                stipend:   "Stipend on application",
                stipendNumeric: 0,
                duration:  "3 months",
                location:  "India",
                isRemote:  false,
                skills:    [],
                applyLink: apply,
                deadline:  this._futureDate(30),
                description: `${role} at ${company || "company"} on Twenty19`,
                sourcePlatform: "Twenty19",
                status:    "OPEN", isActive: true,
                lastScrapedAt: new Date(),
              });
              added++;
            } catch (_) {}
          });
        }

        logger.info(`[Twenty19] ${url} → ${added}`);
        if (added > 0) break;
        await this.sleep(2000);
      } catch (e) {
        logger.warn(`[Twenty19] ${url} failed: ${e.message}`);
      }
    }

    logger.info(`[Twenty19] Total: ${results.length}`);
    return results;
  }

  _logo(name = "") {
    const colors = ["🔴","🟡","🟢","🔵","🟣","🟠","🔶","🔹","🌟","💎"];
    return colors[(name.charCodeAt(0) || 0) % colors.length];
  }
}

module.exports = new TwentyNineScraper();
