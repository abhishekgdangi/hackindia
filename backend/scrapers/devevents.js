/**
 * scrapers/devevents.js
 * dev.events — developer events and hackathons aggregator.
 * Has a public JSON feed. No auth. No WAF. Ad-free, community-curated.
 * API: https://dev.events/api/events
 */
const BaseScraper = require("./base");
const logger      = require("../utils/logger");
const cheerio     = require("cheerio");

class DevEventsScraper extends BaseScraper {
  constructor() {
    super("DevEvents");
    this.apiUrl  = "https://dev.events/api/events";
    this.htmlUrl = "https://dev.events/hackathons";
  }

  async scrape() {
    logger.info("[DevEvents] Starting scrape…");
    const now     = new Date();
    const results = [];

    // Try JSON API
    try {
      const res = await this.get(this.apiUrl, {
        params: { type: "hackathon", upcoming: true, page: 1, limit: 50 },
        headers: { Accept: "application/json", Referer: "https://dev.events/hackathons" },
      });

      const items = res.data?.data || res.data?.events || (Array.isArray(res.data) ? res.data : []);
      for (const item of items) {
        const h = this._parseJson(item, now);
        if (h) results.push(h);
      }
      if (results.length > 0) {
        logger.info(`[DevEvents] API → ${results.length} hackathons`);
        return results;
      }
    } catch (e) {
      logger.warn(`[DevEvents] API failed: ${e.message}`);
    }

    // HTML fallback
    try {
      const res = await this.get(this.htmlUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0",
          Accept: "text/html",
          Referer: "https://dev.events",
        },
      });

      const $   = cheerio.load(res.data);
      let added = 0;

      $(".event-card, article, [class*='event'], [class*='card']").each((_, el) => {
        try {
          const $el    = $(el);
          const name   = $el.find("h2, h3, h4, .title, [class*='name']").first().text().trim();
          if (!name || name.length < 3) return;

          const href   = $el.find("a[href]").first().attr("href") || "";
          const dates  = $el.find("time, [class*='date']").text().trim();
          const loc    = $el.find("[class*='location'], [class*='place'], [class*='city']").first().text().trim();

          const applyLink = href.startsWith("http") ? href :
            `https://dev.events${href.startsWith("/") ? "" : "/"}${href}`;

          const deadline = this._parseDate(dates);
          if (deadline && deadline < now) return;

          results.push(this.normalise({
            name,
            organizer:            "dev.events",
            mode:                 loc.toLowerCase().includes("online") ? "Online" : loc ? "Offline" : "Online",
            city:                 loc || "Online",
            country:              loc.toLowerCase().includes("india") ? "India" : "Global",
            registrationDeadline: deadline || this._futureDate(21),
            prize:                "TBA",
            domains:              this._guessDomainsFromName(name),
            description:          `${name} — developer hackathon on dev.events`,
            applyLink,
            sourceUrl:            this.htmlUrl,
            logo:                 "⚡",
          }));
          added++;
        } catch (_) {}
      });

      logger.info(`[DevEvents] HTML → ${added} hackathons`);
    } catch (e) {
      logger.warn(`[DevEvents] HTML failed: ${e.message}`);
    }

    logger.info(`[DevEvents] Total: ${results.length}`);
    return results;
  }

  _parseJson(item, now) {
    if (!item) return null;
    const start = item.startDate || item.start_date || item.date;
    const end   = item.endDate   || item.end_date;
    const deadline = end || start;
    if (deadline && new Date(deadline) < now) return null;

    const name  = item.name || item.title || "";
    const apply = item.url || item.link || item.website || "";
    if (!name || !apply) return null;

    return this.normalise({
      name,
      organizer:   item.organizer || item.org || "dev.events",
      mode:        item.online || item.virtual ? "Online" : (item.location ? "Offline" : "Online"),
      city:        item.city || item.location || "Online",
      country:     item.country || "Global",
      startDate:   start,
      endDate:     end,
      registrationDeadline: deadline || this._futureDate(21),
      prize:       item.prize || "TBA",
      domains:     item.tags || item.topics || this._guessDomainsFromName(name),
      description: item.description || "",
      applyLink:   apply,
      sourceUrl:   this.htmlUrl,
      externalId:  String(item.id || ""),
      logo:        "⚡",
    });
  }

  _parseDate(str = "") {
    if (!str) return null;
    const match = str.match(/(\d{4}-\d{2}-\d{2})|(\w+ \d{1,2},?\s*\d{4})/);
    if (match) {
      const d = new Date(match[0]);
      if (!isNaN(d.getTime())) return d;
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
    return d.length ? d : ["Open Source"];
  }
}

module.exports = new DevEventsScraper();
