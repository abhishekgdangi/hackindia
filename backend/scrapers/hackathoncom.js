/**
 * scrapers/hackathoncom.js
 * Hackathon.com — world's biggest hackathon aggregator.
 * Public site, no WAF, HTML scrape. Lists 10,000+ hackathons.
 * URL: https://www.hackathon.com
 */
const cheerio     = require("cheerio");
const BaseScraper = require("./base");
const logger      = require("../utils/logger");

class HackathonComScraper extends BaseScraper {
  constructor() {
    super("Hackathon.com");
    this.baseUrl = "https://www.hackathon.com";
    this.pages   = [
      "https://www.hackathon.com/online",
      "https://www.hackathon.com/theme/india",
      "https://www.hackathon.com/theme/ai",
      "https://www.hackathon.com/theme/machine-learning",
      "https://www.hackathon.com/theme/open-source",
    ];
  }

  async scrape() {
    logger.info("[Hackathon.com] Starting scrape…");
    const now     = new Date();
    const results = [];

    for (const url of this.pages) {
      try {
        const res = await this.get(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
            Accept:          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-IN,en;q=0.9",
            Referer:         "https://www.hackathon.com",
            "Cache-Control": "no-cache",
          },
        });

        const $   = cheerio.load(res.data);
        let added = 0;

        // Hackathon.com uses event cards with specific classes
        const selectors = [
          ".event-card", ".hackathon-item", "[class*='hackathon']",
          ".event-tile", ".card", "article", "[class*='event']",
        ];

        for (const sel of selectors) {
          const cards = $(sel);
          if (cards.length < 2) continue;

          cards.each((_, el) => {
            try {
              const $el    = $(el);
              const name   = $el.find("h2, h3, h4, .title, .name, [class*='title'], [class*='name']").first().text().trim();
              if (!name || name.length < 3) return;

              const href  = $el.find("a[href]").first().attr("href") || "";
              const dates = $el.find("time, [class*='date'], [class*='time'], .date").map((_, d) => $(d).text().trim()).get().join(" ");
              const loc   = $el.find("[class*='location'], [class*='city'], [class*='place'], .location").first().text().trim();
              const org   = $el.find("[class*='organizer'], [class*='org'], .organizer").first().text().trim();
              const prize = $el.find("[class*='prize'], [class*='reward']").first().text().trim();

              const applyLink = href.startsWith("http") ? href
                : href ? `${this.baseUrl}${href.startsWith("/") ? "" : "/"}${href}`
                : null;
              if (!applyLink) return;

              const deadline = this._parseDate(dates);
              if (deadline && deadline < now) return;

              const isIndia  = url.includes("india") || loc.toLowerCase().includes("india");
              const isOnline = url.includes("online") || loc.toLowerCase().includes("online") || !loc;

              results.push(this.normalise({
                name,
                organizer:            org || "Hackathon.com",
                mode:                 isOnline ? "Online" : (isIndia ? "Offline" : "Online"),
                city:                 isOnline ? "Online" : (loc || (isIndia ? "India" : "Global")),
                country:              isIndia ? "India" : "Global",
                registrationDeadline: deadline || this._futureDate(21),
                prize:                prize || "TBA",
                domains:              this._guessDomainsFromUrl(url, name),
                description:          `${name} — hackathon listed on Hackathon.com`,
                applyLink,
                sourceUrl:            url,
                logo:                 "🏆",
              }));
              added++;
            } catch (_) {}
          });

          if (added > 0) break; // Found with this selector
        }

        logger.info(`[Hackathon.com] ${url} → ${added}`);
        await this.sleep(2500);
      } catch (e) {
        logger.warn(`[Hackathon.com] ${url} failed: ${e.message}`);
      }
    }

    const unique = this._dedup(results);
    logger.info(`[Hackathon.com] Total: ${unique.length}`);
    return unique;
  }

  _parseDate(str = "") {
    if (!str) return null;
    const patterns = [
      /(\d{4}-\d{2}-\d{2})/,
      /(\w+\s+\d{1,2},?\s*\d{4})/,
      /(\d{1,2}\s+\w+\s+\d{4})/,
    ];
    for (const p of patterns) {
      const m = str.match(p);
      if (m) {
        const d = new Date(m[1]);
        if (!isNaN(d)) return d;
      }
    }
    return null;
  }

  _guessDomainsFromUrl(url = "", name = "") {
    const combined = (url + " " + name).toLowerCase();
    const d = [];
    if (/ai|machine.learning|llm/.test(combined))     d.push("AI/ML");
    if (/web|react|node|frontend/.test(combined))     d.push("Web Dev");
    if (/blockchain|web3|crypto/.test(combined))      d.push("Blockchain");
    if (/data|analytics/.test(combined))              d.push("Data Science");
    if (/cloud|aws|azure/.test(combined))             d.push("Cloud");
    if (/security|cyber/.test(combined))              d.push("Cybersecurity");
    if (/open.source/.test(combined))                 d.push("Open Source");
    if (/health|med/.test(combined))                  d.push("HealthTech");
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

module.exports = new HackathonComScraper();
