/**
 * scrapers/lablab.js
 * lablab.ai — #1 platform for AI hackathons.
 * Fixed: API paths changed. Now scrapes HTML directly with better selectors.
 */
const cheerio     = require("cheerio");
const BaseScraper = require("./base");
const logger      = require("../utils/logger");

class LablabScraper extends BaseScraper {
  constructor() {
    super("Lablab");
    this.baseUrl = "https://lablab.ai";
    this.listUrl = "https://lablab.ai/event";
  }

  async scrape() {
    logger.info("[Lablab] Starting scrape…");
    const now     = new Date();
    const results = [];

    for (const url of [this.listUrl, `${this.listUrl}?status=upcoming`]) {
      try {
        const res = await this.get(url, {
          timeout: 25000,
          headers: {
            "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36",
            Accept:            "text/html,application/xhtml+xml,*/*;q=0.9",
            "Accept-Language": "en-US,en;q=0.9",
            Referer:           "https://lablab.ai",
            "Cache-Control":   "no-cache",
          },
        });

        const $   = cheerio.load(res.data);
        let added = 0;

        // Try Next.js __NEXT_DATA__
        const nextRaw = $("script#__NEXT_DATA__").html();
        if (nextRaw) {
          try {
            const json   = JSON.parse(nextRaw);
            const events = this._dig(json);
            for (const ev of events) {
              const h = this._parseJson(ev, now);
              if (h) { results.push(h); added++; }
            }
          } catch (_) {}
        }

        // HTML fallback — lablab uses Next.js so cards are in DOM
        if (added === 0) {
          const selectors = [
            "a[href*='/event/']", "[class*='EventCard']",
            "[class*='event-card']", "[class*='hackathon']",
            ".event", "article",
          ];

          for (const sel of selectors) {
            $(sel).each((_, el) => {
              try {
                const $el   = $(el);
                const name  = $el.find("h2,h3,h4,[class*='title'],[class*='name']").first().text().trim()
                           || $el.attr("title") || $el.attr("aria-label") || "";
                if (!name || name.length < 3) return;

                const href  = $el.is("a") ? $el.attr("href") : $el.find("a[href]").first().attr("href") || "";
                const apply = href?.startsWith("http") ? href :
                  href ? `${this.baseUrl}${href.startsWith("/") ? "" : "/"}${href}` : null;
                if (!apply) return;

                const prize = $el.find("[class*='prize'],[class*='reward']").first().text().trim();
                const dates = $el.find("time,[class*='date'],[class*='deadline']").text().trim();
                const deadline = this._parseDate(dates);
                if (deadline && deadline < now) return;

                results.push(this.normalise({
                  name,
                  organizer:            "lablab.ai",
                  mode:                 "Online",
                  city:                 "Online",
                  country:              "Global",
                  registrationDeadline: deadline || this._futureDate(21),
                  prize:                prize || "TBA",
                  domains:              ["AI/ML", "Open Source"],
                  description:          `${name} — AI hackathon on lablab.ai`,
                  applyLink:            apply,
                  sourceUrl:            this.listUrl,
                  logo:                 "🤖",
                }));
                added++;
              } catch (_) {}
            });
            if (added > 5) break;
          }
        }

        logger.info(`[Lablab] ${url} → ${added}`);
        await this.sleep(2000);
      } catch (e) {
        logger.warn(`[Lablab] ${url} failed: ${e.message}`);
      }
    }

    const unique = this._dedup(results);
    logger.info(`[Lablab] Total: ${unique.length}`);
    return unique;
  }

  _dig(json) {
    try {
      const page = json?.props?.pageProps;
      if (!page) return [];
      const paths = [
        page.events, page.hackathons, page.data?.events,
        page.dehydratedState?.queries?.[0]?.state?.data?.pages?.[0]?.items,
        page.dehydratedState?.queries?.[0]?.state?.data,
      ];
      for (const p of paths) {
        if (Array.isArray(p) && p.length) return p;
        if (p?.items && Array.isArray(p.items)) return p.items;
      }
      return [];
    } catch (_) { return []; }
  }

  _parseJson(item, now) {
    if (!item) return null;
    const deadline = item.end_date || item.endDate || item.ends_at || item.registration_end;
    if (deadline && new Date(deadline) < now) return null;
    const slug  = item.slug || item.url_slug || String(item.id || "");
    const apply = item.url || (slug ? `${this.baseUrl}/event/${slug}` : null);
    const name  = item.title || item.name || "";
    if (!apply || !name) return null;
    return this.normalise({
      name,
      organizer:   item.organizer || "lablab.ai",
      mode:        "Online",
      city:        "Online",
      country:     "Global",
      startDate:   item.start_date || item.starts_at,
      endDate:     item.end_date   || item.ends_at,
      registrationDeadline: deadline || this._futureDate(21),
      prize:       item.prizes || item.prize || "TBA",
      teamSizeMin: item.min_team_size || 1,
      teamSizeMax: item.max_team_size || 5,
      domains:     item.tags || item.technologies || ["AI/ML"],
      description: item.description || item.tagline || "",
      applyLink:   apply,
      sourceUrl:   this.listUrl,
      externalId:  String(item.id || slug || ""),
      logo:        "🤖",
    });
  }

  _parseDate(str = "") {
    if (!str) return null;
    const m = str.match(/(\d{4}-\d{2}-\d{2})|(\w+\s+\d{1,2},?\s*\d{4})/);
    if (m) { const d = new Date(m[0]); if (!isNaN(d)) return d; }
    return null;
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

module.exports = new LablabScraper();
