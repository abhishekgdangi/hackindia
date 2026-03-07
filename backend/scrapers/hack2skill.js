/**
 * scrapers/hack2skill.js
 * Hack2Skill — India's largest hackathon platform.
 * Fixed: Now tries multiple URL patterns + better selectors.
 */
const cheerio     = require("cheerio");
const BaseScraper = require("./base");
const logger      = require("../utils/logger");

class Hack2SkillScraper extends BaseScraper {
  constructor() {
    super("Hack2Skill");
    this.baseUrl = "https://hack2skill.com";
  }

  async scrape() {
    logger.info("[Hack2Skill] Starting scrape…");
    const now     = new Date();
    const results = [];

    const urls = [
      "https://hack2skill.com/hackathons",
      "https://hack2skill.com/hackathons/open",
      "https://hack2skill.com/challenges",
      "https://hack2skill.com",
    ];

    for (const url of urls) {
      try {
        const res = await this.get(url, {
          timeout: 20000,
          headers: {
            "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
            Accept:            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8",
            "Accept-Encoding": "gzip, deflate, br",
            Connection:        "keep-alive",
            Referer:           "https://hack2skill.com",
            "Cache-Control":   "no-cache",
          },
        });

        const $ = cheerio.load(res.data);
        let added = 0;

        // Try Next.js embedded data first
        const nextData = $("script#__NEXT_DATA__").html();
        if (nextData) {
          try {
            const json = JSON.parse(nextData);
            const hacks = this._fromNext(json);
            for (const h of hacks) {
              const parsed = this._parseJson(h, now);
              if (parsed) { results.push(parsed); added++; }
            }
          } catch (_) {}
        }

        // HTML selectors — try many patterns
        if (added === 0) {
          const selectors = [
            ".hackathon-card", ".hack-card", ".event-card",
            "[class*='hackathon']", "[class*='HackathonCard']",
            "[class*='hack-item']", "[class*='event']",
            ".card", "article", ".listing-item",
          ];

          for (const sel of selectors) {
            $(sel).each((_, el) => {
              try {
                const $el   = $(el);
                const texts = $el.text().trim();
                if (!texts || texts.length < 10) return;

                const name  = $el.find("h1,h2,h3,h4,h5,[class*='title'],[class*='name'],[class*='Title']").first().text().trim();
                if (!name || name.length < 3 || name.length > 120) return;

                const href  = $el.find("a[href]").first().attr("href") || "";
                const apply = href.startsWith("http") ? href :
                  href ? `${this.baseUrl}${href.startsWith("/") ? "" : "/"}${href}` : `${this.baseUrl}/hackathons`;

                const prize = $el.find("[class*='prize'],[class*='reward'],[class*='Prize']").first().text().trim();
                const org   = $el.find("[class*='org'],[class*='company'],[class*='host'],[class*='Org']").first().text().trim();
                const mode  = $el.find("[class*='mode'],[class*='type'],[class*='Mode']").first().text().trim();
                const date  = $el.find("time,[class*='date'],[class*='Date'],[class*='deadline']").first().text().trim();

                const deadline = this._parseDate(date);
                if (deadline && deadline < now) return;

                results.push(this.normalise({
                  name,
                  organizer:            org || "Hack2Skill",
                  mode:                 mode.toLowerCase().includes("online") ? "Online" : "Offline",
                  city:                 mode.toLowerCase().includes("online") ? "Online" : "India",
                  country:              "India",
                  registrationDeadline: deadline || this._futureDate(21),
                  prize:                prize || "TBA",
                  domains:              this._domains(name),
                  description:          `${name} hackathon on Hack2Skill`,
                  applyLink:            apply,
                  sourceUrl:            url,
                  logo:                 "🏅",
                }));
                added++;
              } catch (_) {}
            });
            if (added > 0) break;
          }
        }

        logger.info(`[Hack2Skill] ${url} → ${added}`);
        if (added > 0) break; // Found data, stop trying other URLs
        await this.sleep(2000);
      } catch (e) {
        logger.warn(`[Hack2Skill] ${url} failed: ${e.message}`);
      }
    }

    logger.info(`[Hack2Skill] Total: ${results.length}`);
    return this._dedup(results);
  }

  _fromNext(json) {
    try {
      const page = json?.props?.pageProps;
      if (!page) return [];
      const candidates = [
        page.hackathons, page.data, page.events,
        page.initialData?.hackathons, page.hacks,
      ];
      for (const c of candidates) {
        if (Array.isArray(c) && c.length > 0) return c;
      }
      return [];
    } catch (_) { return []; }
  }

  _parseJson(item, now) {
    if (!item) return null;
    const deadline = item.registration_deadline || item.deadline || item.end_date;
    if (deadline && new Date(deadline) < now) return null;
    const slug  = item.slug || item.id || "";
    const apply = item.url || item.apply_link || (slug ? `${this.baseUrl}/hackathon/${slug}` : null);
    const name  = item.title || item.name || "";
    if (!apply || !name) return null;
    return this.normalise({
      name,
      organizer:   item.organizer || item.organization || "Hack2Skill",
      mode:        item.mode || (item.is_online ? "Online" : "Offline"),
      city:        item.city || item.location || "India",
      country:     "India",
      startDate:   item.start_date,
      endDate:     item.end_date,
      registrationDeadline: deadline || this._futureDate(21),
      prize:       item.prize || "TBA",
      domains:     item.tags || item.themes || this._domains(name),
      description: item.description || "",
      applyLink:   apply,
      sourceUrl:   `${this.baseUrl}/hackathons`,
      externalId:  String(item.id || ""),
      logo:        "🏅",
    });
  }

  _parseDate(str = "") {
    if (!str) return null;
    const clean = str.replace(/deadline|closes|apply by|ends?/gi, "").trim();
    const patterns = [/(\d{4}-\d{2}-\d{2})/, /(\w+\s+\d{1,2},?\s*\d{4})/, /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/];
    for (const p of patterns) {
      const m = clean.match(p);
      if (m) { const d = new Date(m[1]); if (!isNaN(d)) return d; }
    }
    return null;
  }

  _domains(name = "") {
    const n = name.toLowerCase();
    const d = [];
    if (/ai|ml|machine|learning|llm/.test(n))      d.push("AI/ML");
    if (/web|react|node|frontend|backend/.test(n)) d.push("Web Dev");
    if (/blockchain|web3|crypto/.test(n))          d.push("Blockchain");
    if (/data|analytics|science/.test(n))          d.push("Data Science");
    if (/cloud|aws|azure|devops/.test(n))          d.push("Cloud");
    if (/security|cyber|ctf/.test(n))              d.push("Cybersecurity");
    if (/iot|hardware|embedded/.test(n))           d.push("IoT");
    if (/health|med|bio/.test(n))                  d.push("HealthTech");
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

module.exports = new Hack2SkillScraper();
