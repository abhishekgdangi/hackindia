/**
 * scrapers/fresherworld.js
 * Fresherworld — India freshers/internship platform.
 * Fixed: Better selectors + correct URL patterns.
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
      "https://www.fresherworld.com/fresher-jobs/internship",
      "https://www.fresherworld.com/jobs/internship",
    ];
  }

  async scrape() {
    logger.info("[Fresherworld] Starting scrape…");
    const results = [];

    for (const url of this.urls) {
      try {
        const res = await this.get(url, {
          timeout: 20000,
          headers: {
            "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0",
            Accept:            "text/html,application/xhtml+xml",
            "Accept-Language": "en-IN,en;q=0.9",
            Referer:           "https://www.fresherworld.com",
          },
        });

        const $   = cheerio.load(res.data);
        let added = 0;

        // Try JSON in page
        const nextRaw = $("script#__NEXT_DATA__").html()
                     || $("script[type='application/json']").first().html();
        if (nextRaw) {
          try {
            const json = JSON.parse(nextRaw);
            const jobs = json?.props?.pageProps?.jobs
                      || json?.props?.pageProps?.internships
                      || json?.data || [];
            if (Array.isArray(jobs) && jobs.length) {
              for (const job of jobs) {
                const role = job.title || job.role || "";
                if (!role) continue;
                results.push({
                  company:   job.company || "Company",
                  role,
                  logo:      this._logo(job.company || ""),
                  stipend:   job.stipend || job.salary || "As per industry",
                  stipendNumeric: 0,
                  duration:  job.duration || "3-6 months",
                  location:  job.location || job.city || "India",
                  isRemote:  job.remote || false,
                  skills:    job.skills || [],
                  applyLink: job.url || job.apply_link || url,
                  deadline:  this._futureDate(21),
                  description: (job.description || "").slice(0, 300),
                  sourcePlatform: "Fresherworld",
                  status:    "OPEN", isActive: true,
                  lastScrapedAt: new Date(),
                });
                added++;
              }
            }
          } catch (_) {}
        }

        // HTML fallback
        if (added === 0) {
          // Try multiple class patterns
          $(".job,.listing,.internship,.opening,article,[class*='job'],[class*='card'],[class*='listing']").each((_, el) => {
            try {
              const $el      = $(el);
              const role     = $el.find("h2,h3,h4,a.title,.jobtitle,[class*='title']").first().text().trim();
              const company  = $el.find(".company,[class*='company'],[class*='employer']").first().text().trim();
              if (!role || role.length < 3 || role.length > 120) return;

              const href   = $el.find("a[href*='internship'],a[href*='job'],a[href]").first().attr("href") || "";
              const loc    = $el.find("[class*='location'],[class*='city'],span").filter((_, s) => {
                const t = $(s).text().toLowerCase();
                return t.includes("india") || t.includes("mumbai") || t.includes("bangalore") ||
                       t.includes("delhi") || t.includes("hyderabad") || t.includes("work from home");
              }).first().text().trim();

              const apply  = href.startsWith("http") ? href :
                href ? `${this.baseUrl}${href.startsWith("/") ? "" : "/"}${href}` : url;

              results.push({
                company:   company || "Company",
                role,
                logo:      this._logo(company),
                stipend:   "As per industry norms",
                stipendNumeric: 0,
                duration:  "3-6 months",
                location:  loc || "India",
                isRemote:  loc.toLowerCase().includes("work from home"),
                skills:    this._skills(role),
                applyLink: apply,
                deadline:  this._futureDate(21),
                description: `${role} internship at ${company || "company"}`,
                sourcePlatform: "Fresherworld",
                status:    "OPEN", isActive: true,
                lastScrapedAt: new Date(),
              });
              added++;
            } catch (_) {}
          });
        }

        logger.info(`[Fresherworld] ${url} → ${added}`);
        if (added > 0) break;
        await this.sleep(2000);
      } catch (e) {
        logger.warn(`[Fresherworld] ${url} failed: ${e.message}`);
      }
    }

    logger.info(`[Fresherworld] Total: ${results.length}`);
    return this._dedup(results);
  }

  _skills(role = "") {
    const r = role.toLowerCase();
    if (r.includes("python"))   return ["Python", "Django"];
    if (r.includes("react"))    return ["React", "JavaScript"];
    if (r.includes("java"))     return ["Java", "Spring Boot"];
    if (r.includes("data"))     return ["Python", "SQL", "Excel"];
    if (r.includes("android"))  return ["Kotlin", "Java", "Android"];
    if (r.includes("web"))      return ["HTML", "CSS", "JavaScript"];
    return ["Programming", "Communication"];
  }

  _logo(name = "") {
    const colors = ["🔴","🟡","🟢","🔵","🟣","🟠","🔶","🔹","🌟","💎"];
    return colors[(name.charCodeAt(0) || 0) % colors.length];
  }

  _dedup(arr) {
    const seen = new Set();
    return arr.filter(i => {
      const k = `${i.company}|${i.role}`.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
  }
}

module.exports = new FresherworldScraper();
