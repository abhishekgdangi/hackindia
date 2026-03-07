/**
 * scrapers/reskilll.js
 * Reskilll.com — Indian hackathon & skill challenge platform.
 * Hosts India-focused hackathons with industry partners.
 * Public HTML listing. No WAF. No auth.
 * URL: https://reskilll.com/allhacks
 */
const cheerio     = require("cheerio");
const BaseScraper = require("./base");
const logger      = require("../utils/logger");

class ReskilllScraper extends BaseScraper {
  constructor() {
    super("Reskilll");
    this.baseUrl = "https://reskilll.com";
    this.urls    = [
      "https://reskilll.com/allhacks",
      "https://reskilll.com/allhacks?type=online",
    ];
  }

  async scrape() {
    logger.info("[Reskilll] Starting scrape…");
    const now     = new Date();
    const results = [];

    // Try JSON API first
    try {
      const res = await this.get(`${this.baseUrl}/api/hackathons`, {
        headers: {
          Accept:   "application/json",
          Referer:  "https://reskilll.com/allhacks",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0",
        },
      });
      if (res.headers["content-type"]?.includes("json")) {
        const items = res.data?.data || res.data?.hackathons || (Array.isArray(res.data) ? res.data : []);
        if (items.length > 0) {
          for (const item of items) {
            const h = this._parseJson(item, now);
            if (h) results.push(h);
          }
          logger.info(`[Reskilll] API → ${results.length}`);
          return results;
        }
      }
    } catch (e) {
      logger.warn(`[Reskilll] API failed: ${e.message}`);
    }

    for (const url of this.urls) {
      try {
        const res = await this.get(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0",
            Accept:       "text/html,application/xhtml+xml",
            "Accept-Language": "en-IN,en;q=0.9",
            Referer:      "https://reskilll.com",
          },
        });

        const $   = cheerio.load(res.data);
        let added = 0;

        // Try embedded JSON
        const nextData = $("script#__NEXT_DATA__").html();
        if (nextData) {
          try {
            const json   = JSON.parse(nextData);
            const events = this._extractFromNext(json);
            for (const item of events) {
              const h = this._parseJson(item, now);
              if (h) { results.push(h); added++; }
            }
          } catch (_) {}
        }

        if (added === 0) {
          // HTML card scrape
          $(".hack-card, .hackathon-card, [class*='hack'], [class*='card'], article, .event").each((_, el) => {
            try {
              const $el  = $(el);
              const name = $el.find("h2, h3, h4, [class*='title'], [class*='name']").first().text().trim();
              if (!name || name.length < 3) return;

              const href     = $el.find("a[href]").first().attr("href") || "";
              const prize    = $el.find("[class*='prize'], [class*='reward']").first().text().trim();
              const dates    = $el.find("time, [class*='date'], [class*='deadline']").text().trim();
              const mode     = $el.find("[class*='mode'], [class*='type'], [class*='online']").first().text().trim();
              const org      = $el.find("[class*='org'], [class*='company'], [class*='host']").first().text().trim();

              const apply = href.startsWith("http") ? href :
                href ? `${this.baseUrl}${href.startsWith("/") ? "" : "/"}${href}` : null;
              if (!apply) return;

              const deadline = this._parseDate(dates);
              if (deadline && deadline < now) return;

              const isOnline = mode.toLowerCase().includes("online") || url.includes("online");

              results.push(this.normalise({
                name,
                organizer:            org || "Reskilll",
                mode:                 isOnline ? "Online" : "Offline",
                city:                 isOnline ? "Online" : "India",
                country:              "India",
                registrationDeadline: deadline || this._futureDate(21),
                prize:                prize || "TBA",
                domains:              this._guessDomainsFromName(name),
                description:          `${name} — hackathon on Reskilll.com`,
                applyLink:            apply,
                sourceUrl:            url,
                logo:                 "⚙️",
              }));
              added++;
            } catch (_) {}
          });
        }

        logger.info(`[Reskilll] ${url} → ${added}`);
        await this.sleep(2000);
      } catch (e) {
        logger.warn(`[Reskilll] ${url} failed: ${e.message}`);
      }
    }

    const unique = this._dedup(results);
    logger.info(`[Reskilll] Total: ${unique.length}`);
    return unique;
  }

  _extractFromNext(json) {
    try {
      const page = json?.props?.pageProps;
      if (!page) return [];
      const candidates = [page.hackathons, page.data, page.events, page.hacks];
      for (const c of candidates) {
        if (Array.isArray(c) && c.length > 0) return c;
      }
      return [];
    } catch (_) { return []; }
  }

  _parseJson(item, now) {
    if (!item) return null;
    const deadline = item.registration_deadline || item.deadline || item.end_date || item.ends_at;
    if (deadline && new Date(deadline) < now) return null;
    const slug  = item.slug || item.id || "";
    const apply = item.url || item.apply_link || (slug ? `${this.baseUrl}/hack/${slug}` : null);
    const name  = item.title || item.name || "";
    if (!apply || !name) return null;
    return this.normalise({
      name,
      organizer:   item.organizer || item.organization || "Reskilll",
      mode:        item.mode || (item.is_online ? "Online" : "Offline"),
      city:        item.city || (item.is_online ? "Online" : "India"),
      country:     "India",
      startDate:   item.start_date || item.starts_at,
      endDate:     item.end_date   || item.ends_at,
      registrationDeadline: deadline || this._futureDate(21),
      prize:       item.prize || "TBA",
      domains:     item.tags || item.themes || this._guessDomainsFromName(name),
      description: item.description || "",
      applyLink:   apply,
      sourceUrl:   this.urls[0],
      externalId:  String(item.id || ""),
      logo:        "⚙️",
    });
  }

  _parseDate(str = "") {
    if (!str) return null;
    const m = str.match(/(\d{4}-\d{2}-\d{2})|(\w+\s+\d{1,2},?\s*\d{4})/);
    if (m) {
      const d = new Date(m[0]);
      if (!isNaN(d)) return d;
    }
    return null;
  }

  _guessDomainsFromName(name = "") {
    const n = name.toLowerCase();
    const d = [];
    if (/ai|ml|machine|learning|llm/.test(n))      d.push("AI/ML");
    if (/web|react|node|frontend|backend/.test(n)) d.push("Web Dev");
    if (/blockchain|web3|crypto/.test(n))          d.push("Blockchain");
    if (/data|analytics|science/.test(n))          d.push("Data Science");
    if (/cloud|aws|azure|devops/.test(n))          d.push("Cloud");
    if (/security|cyber|ctf/.test(n))              d.push("Cybersecurity");
    if (/iot|hardware|embedded/.test(n))           d.push("IoT");
    if (/health|med/.test(n))                      d.push("HealthTech");
    if (/agri|farm/.test(n))                       d.push("AgriTech");
    return d.length ? d : ["Open Source"];
  }

  _dedup(arr) {
    const seen = new Set();
    return arr.filter(h => {
      const k = h.name.toLowerCase().trim();
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
  }
}

module.exports = new ReskilllScraper();
