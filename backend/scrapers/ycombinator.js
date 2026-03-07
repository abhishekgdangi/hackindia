/**
 * scrapers/ycombinator.js
 * Y Combinator Work at Startup — startup internships.
 * Fixed: correct URL is /internships not /jobs?type=intern
 */
const BaseScraper = require("./base");
const cheerio     = require("cheerio");
const logger      = require("../utils/logger");

class YCombinatorScraper extends BaseScraper {
  constructor() {
    super("YCombinator");
    this.baseUrl = "https://www.workatastartup.com";
    this.urls    = [
      "https://www.workatastartup.com/internships",
      "https://www.workatastartup.com/internships?role=eng",
    ];
  }

  async scrape() {
    logger.info("[YCombinator] Starting scrape…");
    const results = [];

    for (const url of this.urls) {
      try {
        const res = await this.get(url, {
          timeout: 20000,
          headers: {
            "User-Agent":    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0",
            Accept:          "text/html,application/xhtml+xml,*/*",
            "Accept-Language": "en-US,en;q=0.9",
            Referer:         "https://www.workatastartup.com",
          },
        });

        const $   = cheerio.load(res.data);
        let added = 0;

        // Next.js data
        const nextRaw = $("script#__NEXT_DATA__").html();
        if (nextRaw) {
          try {
            const json = JSON.parse(nextRaw);
            const page = json?.props?.pageProps;
            const jobs = page?.jobs || page?.internships || page?.data?.jobs || [];
            if (Array.isArray(jobs)) {
              for (const job of jobs) {
                const i = this._parseJob(job);
                if (i) { results.push(i); added++; }
              }
            }
          } catch (_) {}
        }

        // HTML
        if (added === 0) {
          $(".job-row,.listing,[class*='job'],[class*='internship'],article").each((_, el) => {
            try {
              const $el    = $(el);
              const role   = $el.find("h3,h4,.title,[class*='title']").first().text().trim();
              const company = $el.find(".company,[class*='company'],[class*='startup']").first().text().trim();
              if (!role || role.length < 3) return;
              const href   = $el.find("a[href]").first().attr("href") || "";
              const apply  = href.startsWith("http") ? href :
                href ? `${this.baseUrl}${href}` : this.baseUrl;
              results.push({
                company:   company || "YC Startup",
                role,
                logo:      this._logo(company),
                stipend:   "Competitive (USD)",
                stipendNumeric: 0,
                duration:  "3 months",
                location:  "Remote / USA",
                isRemote:  true,
                skills:    ["JavaScript", "Python", "React"],
                applyLink: apply,
                deadline:  this._futureDate(30),
                description: `${role} at ${company || "YC-backed startup"}`,
                sourcePlatform: "YCombinator",
                status:    "OPEN", isActive: true,
                lastScrapedAt: new Date(),
              });
              added++;
            } catch (_) {}
          });
        }

        logger.info(`[YCombinator] ${url} → ${added}`);
        if (added > 0) break;
        await this.sleep(2000);
      } catch (e) {
        logger.warn(`[YCombinator] ${url} failed: ${e.message}`);
      }
    }

    logger.info(`[YCombinator] Total: ${results.length}`);
    return results;
  }

  _parseJob(job) {
    if (!job) return null;
    const title = (job.title || job.name || "").toLowerCase();
    if (!title.includes("intern") && !title.includes("junior")) return null;
    const apply = job.url || job.link || "";
    if (!apply) return null;
    return {
      company:   job.company?.name || job.company || "YC Startup",
      role:      job.title || job.name,
      logo:      this._logo(job.company?.name || ""),
      stipend:   job.compensation || "Competitive",
      stipendNumeric: 0,
      duration:  "3 months",
      location:  job.location || "Remote",
      isRemote:  job.remote !== false,
      skills:    job.skills || job.tags || [],
      applyLink: apply,
      deadline:  this._futureDate(30),
      description: (job.description || "").slice(0, 300),
      sourcePlatform: "YCombinator",
      status:    "OPEN", isActive: true,
      lastScrapedAt: new Date(),
    };
  }

  _logo(name = "") {
    const colors = ["🔴","🟡","🟢","🔵","🟣","🟠","🔶","🔹","🌟","💎","🦄","🚀"];
    return colors[(name.charCodeAt(0) || 0) % colors.length];
  }
}

module.exports = new YCombinatorScraper();
