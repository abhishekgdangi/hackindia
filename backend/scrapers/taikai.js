/**
 * scrapers/taikai.js
 * TAIKAI — global hackathon platform, 90K+ builders.
 * Fixed: API base URL corrected. Uses taikai.network directly.
 */
const BaseScraper = require("./base");
const cheerio     = require("cheerio");
const logger      = require("../utils/logger");

class TAIKAIScraper extends BaseScraper {
  constructor() {
    super("TAIKAI");
    this.baseUrl = "https://taikai.network";
    this.listUrl = "https://taikai.network/hackathons";
  }

  async scrape() {
    logger.info("[TAIKAI] Starting scrape…");
    const now     = new Date();
    const results = [];

    // Correct API endpoint
    const apiUrls = [
      "https://taikai.network/api/challenges?type=hackathon&status=open&limit=30",
      "https://taikai.network/api/v1/challenges?type=hackathon&open=true",
      "https://taikai.network/api/hackathons?open=true&limit=30",
    ];

    for (const apiUrl of apiUrls) {
      try {
        const res = await this.get(apiUrl, {
          timeout: 15000,
          headers: {
            Accept:   "application/json",
            Origin:   "https://taikai.network",
            Referer:  "https://taikai.network/hackathons",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0",
          },
        });
        if (res.headers["content-type"]?.includes("json")) {
          const items = res.data?.challenges || res.data?.hackathons ||
                        res.data?.data || (Array.isArray(res.data) ? res.data : []);
          if (items.length > 0) {
            for (const item of items) {
              const h = this._parseJson(item, now);
              if (h) results.push(h);
            }
            logger.info(`[TAIKAI] API → ${results.length}`);
            return this._dedup(results);
          }
        }
      } catch (e) {
        logger.warn(`[TAIKAI] API ${apiUrl} failed: ${e.message}`);
      }
    }

    // HTML scrape fallback
    for (const url of [this.listUrl, `${this.listUrl}?page=1`]) {
      try {
        const res = await this.get(url, {
          timeout: 20000,
          headers: {
            "User-Agent":    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0",
            Accept:          "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
            Referer:         "https://taikai.network",
          },
        });

        const $   = cheerio.load(res.data);
        let added = 0;

        // Try Next.js data
        const nextRaw = $("script#__NEXT_DATA__").html();
        if (nextRaw) {
          try {
            const json    = JSON.parse(nextRaw);
            const page    = json?.props?.pageProps;
            const sources = [
              page?.challenges, page?.hackathons, page?.data?.challenges,
              page?.dehydratedState?.queries?.[0]?.state?.data?.challenges,
            ];
            for (const src of sources) {
              if (Array.isArray(src) && src.length) {
                for (const item of src) {
                  const h = this._parseJson(item, now);
                  if (h) { results.push(h); added++; }
                }
                break;
              }
            }
          } catch (_) {}
        }

        // HTML cards
        if (added === 0) {
          $("[class*='challenge'],[class*='hackathon'],[class*='card'],article").each((_, el) => {
            try {
              const $el  = $(el);
              const name = $el.find("h2,h3,h4,[class*='title'],[class*='name']").first().text().trim();
              if (!name || name.length < 3) return;
              const href  = $el.find("a[href]").first().attr("href") || "";
              const apply = href.startsWith("http") ? href :
                href ? `${this.baseUrl}${href}` : null;
              if (!apply) return;
              const prize = $el.find("[class*='prize'],[class*='reward']").first().text().trim();
              results.push(this.normalise({
                name,
                organizer:   "TAIKAI",
                mode:        "Online",
                city:        "Online",
                country:     "Global",
                registrationDeadline: this._futureDate(21),
                prize:       prize || "TBA",
                domains:     ["Blockchain", "Web Dev", "AI/ML"],
                description: `${name} on TAIKAI`,
                applyLink:   apply,
                sourceUrl:   this.listUrl,
                logo:        "⛓️",
              }));
              added++;
            } catch (_) {}
          });
        }

        logger.info(`[TAIKAI] HTML ${url} → ${added}`);
        await this.sleep(2000);
      } catch (e) {
        logger.warn(`[TAIKAI] HTML ${url} failed: ${e.message}`);
      }
    }

    const unique = this._dedup(results);
    logger.info(`[TAIKAI] Total: ${unique.length}`);
    return unique;
  }

  _parseJson(item, now) {
    if (!item) return null;
    const deadline = item.ends_at || item.end_date || item.endDate || item.applicationDeadline;
    if (deadline && new Date(deadline) < now) return null;
    const slug    = item.slug || "";
    const org     = item.organization?.slug || item.project?.slug || "";
    const apply   = item.url ||
      (org && slug ? `${this.baseUrl}/${org}/hackathon/${slug}` : null) ||
      (slug ? `${this.baseUrl}/hackathon/${slug}` : null);
    const name    = item.title || item.name || "";
    if (!apply || !name) return null;
    return this.normalise({
      name,
      organizer:   item.organization?.name || "TAIKAI",
      mode:        item.location ? "Offline" : "Online",
      city:        item.location || "Online",
      country:     item.country || "Global",
      startDate:   item.starts_at || item.start_date,
      endDate:     item.ends_at   || item.end_date,
      registrationDeadline: deadline || this._futureDate(21),
      prize:       item.totalPrize || item.total_prize || item.prize || "TBA",
      teamSizeMin: item.minTeamMembers || 1,
      teamSizeMax: item.maxTeamMembers || 5,
      domains:     item.tags || item.categories || ["Blockchain", "Web Dev"],
      description: item.description || item.tagline || "",
      applyLink:   apply,
      sourceUrl:   this.listUrl,
      externalId:  String(item.id || ""),
      logo:        "⛓️",
    });
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

module.exports = new TAIKAIScraper();
