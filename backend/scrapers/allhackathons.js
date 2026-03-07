/**
 * scrapers/allhackathons.js
 * AllHackathons.com — free aggregator listing hackathons from all platforms.
 * HTML scrape. No auth. No WAF. robots.txt allows bots.
 * URL: https://allhackathons.com/hackathons/
 */
const cheerio     = require("cheerio");
const BaseScraper = require("./base");
const logger      = require("../utils/logger");

class AllHackathonsScraper extends BaseScraper {
  constructor() {
    super("AllHackathons");
    this.baseUrl = "https://allhackathons.com";
    this.listUrl = "https://allhackathons.com/hackathons/";
  }

  async scrape() {
    logger.info("[AllHackathons] Starting scrape…");
    const now     = new Date();
    const results = [];

    const urls = [
      "https://allhackathons.com/hackathons/",
      "https://allhackathons.com/hackathons/online/",
      "https://allhackathons.com/hackathons/india/",
    ];

    for (const url of urls) {
      try {
        const res = await this.get(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0",
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "en-IN,en;q=0.9",
          },
        });

        const $     = cheerio.load(res.data);
        let   added = 0;

        // AllHackathons uses article cards
        $("article, .hackathon-card, .event-card, .card, [class*='hackathon']").each((_, el) => {
          try {
            const $el    = $(el);
            const name   = $el.find("h2, h3, h4, .title, [class*='title']").first().text().trim();
            if (!name || name.length < 3) return;

            const href   = $el.find("a[href]").first().attr("href") || "";
            const org    = $el.find("[class*='org'], [class*='author'], .org").first().text().trim();
            const dates  = $el.find("time, [class*='date'], [class*='time']").text().trim();
            const prize  = $el.find("[class*='prize'], [class*='reward']").first().text().trim();
            const mode   = $el.find("[class*='mode'], [class*='location'], [class*='type']").first().text().trim();

            const applyLink = href.startsWith("http") ? href :
              `${this.baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;

            const deadline = this._parseDate(dates);
            if (deadline && deadline < now) return;

            results.push(this.normalise({
              name,
              organizer:            org || "AllHackathons",
              mode:                 this._guessMode(mode, name),
              city:                 mode.toLowerCase().includes("india") ? "India" : "Online",
              country:              mode.toLowerCase().includes("india") ? "India" : "Global",
              registrationDeadline: deadline || this._futureDate(21),
              prize:                prize || "TBA",
              domains:              this._guessDomainsFromName(name),
              description:          `${name} — listed on AllHackathons.com`,
              applyLink,
              sourceUrl:            url,
              logo:                 "🌐",
            }));
            added++;
          } catch (_) {}
        });

        logger.info(`[AllHackathons] ${url} → ${added} hackathons`);
        await this.sleep(2000);
      } catch (e) {
        logger.warn(`[AllHackathons] ${url} failed: ${e.message}`);
      }
    }

    logger.info(`[AllHackathons] Total: ${results.length}`);
    return this._dedup(results);
  }

  _parseDate(str = "") {
    if (!str) return null;
    // Try to find a date pattern like "Mar 2026", "March 2026", "2026-03-15"
    const patterns = [
      /(\d{4}-\d{2}-\d{2})/,
      /(\w+ \d{1,2},?\s*\d{4})/,
      /(\d{1,2}\s+\w+\s+\d{4})/,
    ];
    for (const p of patterns) {
      const match = str.match(p);
      if (match) {
        const d = new Date(match[1]);
        if (!isNaN(d.getTime())) return d;
      }
    }
    return null;
  }

  _guessMode(mode = "", name = "") {
    const m = (mode + name).toLowerCase();
    if (m.includes("online") && m.includes("offline")) return "Online + Offline";
    if (m.includes("offline") || m.includes("in-person") || m.includes("onsite")) return "Offline";
    return "Online";
  }

  _guessDomainsFromName(name = "") {
    const n = name.toLowerCase();
    const d = [];
    if (/ai|ml|machine|learning|llm/.test(n))        d.push("AI/ML");
    if (/web|react|node|frontend|backend/.test(n))   d.push("Web Dev");
    if (/blockchain|web3|crypto|defi/.test(n))       d.push("Blockchain");
    if (/data|analytics|science/.test(n))            d.push("Data Science");
    if (/cloud|aws|azure|devops/.test(n))            d.push("Cloud");
    if (/security|cyber|ctf/.test(n))                d.push("Cybersecurity");
    if (/iot|hardware|embedded/.test(n))             d.push("IoT");
    if (/health|med|bio/.test(n))                    d.push("HealthTech");
    if (/finance|fintech|bank/.test(n))              d.push("FinTech");
    if (/game|gaming/.test(n))                       d.push("GameDev");
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

module.exports = new AllHackathonsScraper();
