/**
 * scrapers/letsintern.js
 * LetsIntern — Indian internship platform.
 * Fixed: URL structure was /internships/{category}, now corrected.
 */
const cheerio     = require("cheerio");
const BaseScraper = require("./base");
const logger      = require("../utils/logger");

class LetsInternScraper extends BaseScraper {
  constructor() {
    super("LetsIntern");
    this.baseUrl = "https://letsintern.com";
    this.urls    = [
      "https://letsintern.com/internships",
      "https://letsintern.com/internships/it",
      "https://letsintern.com/internships/engineering",
      "https://letsintern.com/internship/software",
      "https://letsintern.com/jobs/internship",
    ];
  }

  async scrape() {
    logger.info("[LetsIntern] Starting scrape…");
    const results = [];

    for (const url of this.urls) {
      try {
        const res = await this.get(url, {
          timeout: 20000,
          headers: {
            "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0",
            Accept:            "text/html,application/xhtml+xml",
            "Accept-Language": "en-IN,en;q=0.9",
            Referer:           "https://letsintern.com",
          },
        });

        const $   = cheerio.load(res.data);
        let added = 0;

        // Try Next.js JSON
        const nextRaw = $("script#__NEXT_DATA__").html();
        if (nextRaw) {
          try {
            const json  = JSON.parse(nextRaw);
            const page  = json?.props?.pageProps;
            const lists = [page?.internships, page?.jobs, page?.data, page?.listings];
            for (const list of lists) {
              if (Array.isArray(list) && list.length) {
                for (const item of list) {
                  const i = this._parseJson(item);
                  if (i) { results.push(i); added++; }
                }
                break;
              }
            }
          } catch (_) {}
        }

        // HTML fallback
        if (added === 0) {
          $(".internship-card,.job-card,.listing,.card,article,[class*='intern'],[class*='job']").each((_, el) => {
            try {
              const $el      = $(el);
              const role     = $el.find("h2,h3,h4,.title,[class*='title'],[class*='role']").first().text().trim();
              const company  = $el.find(".company,[class*='company'],[class*='org']").first().text().trim();
              if (!role || role.length < 3) return;
              const href     = $el.find("a[href]").first().attr("href") || "";
              const stipend  = $el.find("[class*='stipend'],[class*='salary'],[class*='pay']").first().text().trim();
              const location = $el.find("[class*='location'],[class*='city']").first().text().trim();
              const apply    = href.startsWith("http") ? href :
                href ? `${this.baseUrl}${href}` : this.baseUrl;
              results.push({
                company:   company || "Company",
                role,
                logo:      this._logo(company),
                stipend:   stipend || "Stipend on application",
                stipendNumeric: 0,
                duration:  "3 months",
                location:  location || "India",
                isRemote:  location.toLowerCase().includes("work from home") || location.toLowerCase().includes("remote"),
                skills:    [],
                applyLink: apply,
                deadline:  this._futureDate(30),
                description: `${role} at ${company || "company"} on LetsIntern`,
                sourcePlatform: "LetsIntern",
                status:    "OPEN",
                isActive:  true,
                lastScrapedAt: new Date(),
              });
              added++;
            } catch (_) {}
          });
        }

        logger.info(`[LetsIntern] ${url} → ${added}`);
        if (added > 0) break;
        await this.sleep(1500);
      } catch (e) {
        logger.warn(`[LetsIntern] ${url} failed: ${e.message}`);
      }
    }

    logger.info(`[LetsIntern] Total: ${results.length}`);
    return results;
  }

  _parseJson(item) {
    if (!item) return null;
    const role    = item.title || item.role || item.position || "";
    const company = item.company?.name || item.company || item.organization || "";
    if (!role) return null;
    const apply = item.url || item.apply_link || item.link || this.baseUrl;
    return {
      company:   company || "Company",
      role,
      logo:      this._logo(company),
      stipend:   item.stipend || item.salary || "Stipend on application",
      stipendNumeric: 0,
      duration:  item.duration || "3 months",
      location:  item.location || item.city || "India",
      isRemote:  item.is_remote || item.remote || false,
      skills:    item.skills || item.tags || [],
      applyLink: apply,
      deadline:  this._futureDate(30),
      description: item.description?.slice(0, 300) || "",
      sourcePlatform: "LetsIntern",
      status:    "OPEN",
      isActive:  true,
      lastScrapedAt: new Date(),
    };
  }

  _logo(name = "") {
    const colors = ["🔴","🟡","🟢","🔵","🟣","🟠","🔶","🔹","🌟","💎"];
    return colors[(name.charCodeAt(0) || 0) % colors.length];
  }
}

module.exports = new LetsInternScraper();
