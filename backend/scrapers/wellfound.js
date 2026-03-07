/**
 * scrapers/wellfound.js
 * Wellfound (formerly AngelList Talent) — Startup internship listings
 *
 * Strategy: Wellfound exposes a JSON API used by their jobs/internships page.
 * Their GraphQL endpoint is auth-gated, but their public listing page
 * embeds data in window.__APOLLO_STATE__ or __NEXT_DATA__.
 *
 * Fallback: Fetch their /role/internship page and parse __NEXT_DATA__.
 *
 * ✅ APPROACH: __NEXT_DATA__ + direct API
 */

const BaseScraper = require("./base");
const logger      = require("../utils/logger");

class WellfoundScraper extends BaseScraper {
  constructor() {
    super("Wellfound");
    this.apiUrl  = "https://wellfound.com/role/r/software-engineer-intern";
    this.apiUrl2 = "https://wellfound.com/jobs?role=software-engineer-intern&location=india";
  }

  async scrape() {
    logger.info("[Wellfound] Starting scrape…");
    const results = [];

    const urls = [this.apiUrl, this.apiUrl2];

    for (const url of urls) {
      try {
        const res  = await this.get(url, {
          headers: {
            Accept:          "text/html,*/*",
            "Cache-Control": "no-cache",
          },
          timeout: 25000,
        });

        const html  = res.data || "";
        const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (!match) {
          logger.warn(`[Wellfound] No __NEXT_DATA__ in ${url}`);
          continue;
        }

        const nextData = JSON.parse(match[1]);
        const jobs     =
          nextData?.props?.pageProps?.jobs       ||
          nextData?.props?.pageProps?.jobListings ||
          nextData?.props?.pageProps?.startups   ||
          [];

        logger.info(`[Wellfound] ${url} → ${jobs.length} job listings`);

        for (const job of jobs) {
          try {
            const i = this._parse(job);
            if (i) results.push(i);
          } catch (e) {
            logger.warn(`[Wellfound] Parse error: ${e.message}`);
          }
        }
        await this.sleep(3000);
      } catch (err) {
        logger.warn(`[Wellfound] Failed ${url}: ${err.message}`);
      }
    }

    logger.info(`[Wellfound] Returning ${results.length} internships`);
    return results;
  }

  _parse(job) {
    // Wellfound job shapes vary — try multiple field names
    const company  = job.startup?.name || job.company?.name || job.company_name || "";
    const role     = job.title || job.role || job.job_type || "Intern";
    const link     = job.url  || job.apply_url ||
                     (job.startup?.slug
                       ? `https://wellfound.com/company/${job.startup.slug}/jobs/${job.id}`
                       : "");

    if (!company || !link) return null;

    const location = job.location_names?.[0] || job.location || "India";
    const stipend  = job.salary_range
      ? `$${job.salary_range.min}–$${job.salary_range.max} /month`
      : (job.compensation || "TBA");

    const skills   = (job.skills || job.tags || [])
      .map(s => typeof s === "string" ? s : s.name || "")
      .filter(Boolean);

    return {
      company,
      role:      role.trim(),
      location:  location.trim(),
      stipend,
      duration:  job.duration || "3–6 months",
      deadline:  job.deadline || null,
      applyLink: link,
      skills,
      source:    "Wellfound",
      isRemote:  /remote/i.test(location),
      isActive:  true,
      lastScrapedAt: new Date(),
    };
  }
}

const _inst = new WellfoundScraper();
module.exports = { scrape: () => _inst.scrape() };
