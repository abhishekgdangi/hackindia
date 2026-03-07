/**
 * scrapers/dorahacks.js
 * DoraHacks — Global Web3/AI/Open-Source hackathon platform
 *
 * Strategy: DoraHacks exposes a public REST API used by their explore page.
 * Discovered by inspecting network requests on https://dorahacks.io/hackathon
 *
 * Endpoint: GET https://dorahacks.io/api/hackathon/list/?status=open&limit=30
 *
 * ✅ APPROACH: Direct REST API (JSON) — no auth required
 */

const BaseScraper = require("./base");
const logger      = require("../utils/logger");

class DoraHacksScraper extends BaseScraper {
  constructor() {
    super("DoraHacks");
    this.apiUrl  = "https://dorahacks.io/api/hackathon/list/";
    this.baseUrl = "https://dorahacks.io";
  }

  async scrape() {
    logger.info("[DoraHacks] Starting scrape…");
    const results = [];

    const queries = [
      { status: "open",   limit: 30, offset: 0 },
      { status: "voting", limit: 20, offset: 0 },   // voting phase = still active
    ];

    for (const params of queries) {
      try {
        const res = await this.get(this.apiUrl, {
          params,
          headers: {
            Accept:  "application/json",
            Referer: "https://dorahacks.io/hackathon",
            Origin:  "https://dorahacks.io",
          },
          timeout: 20000,
        });

        // Response: { data: { hackathons: [...] } } or { hackathons: [...] }
        const body  = res.data;
        const items =
          body?.data?.hackathons ||
          body?.hackathons       ||
          body?.data             ||
          (Array.isArray(body)   ? body : []);

        logger.info(`[DoraHacks] status=${params.status} → ${items.length} items`);

        for (const item of items) {
          try {
            const h = this._parse(item);
            if (h) results.push(h);
          } catch (e) {
            logger.warn(`[DoraHacks] Parse error: ${e.message}`);
          }
        }
        await this.sleep(2000);
      } catch (err) {
        logger.warn(`[DoraHacks] status=${params.status} failed: ${err.message}`);
      }
    }

    logger.info(`[DoraHacks] Returning ${results.length} hackathons`);
    return results;
  }

  _parse(item) {
    const title = item.title || item.name || "";
    if (!title) return null;

    const id    = item.id || item._id || item.slug || "";
    const link  = id
      ? `https://dorahacks.io/hackathon/${id}`
      : (item.url || "");
    if (!link) return null;

    // Prize pool
    const prizeAmt  = item.total_prize || item.prize_pool || item.bounty || 0;
    const prizeCur  = item.prize_currency || "USDT";
    const prize     = prizeAmt ? `${prizeAmt.toLocaleString()} ${prizeCur}` : "TBA";

    // Dates
    const start  = item.start_time  || item.start_date  || null;
    const end    = item.end_time    || item.end_date    || null;
    const regEnd = item.register_end_time || item.reg_deadline || end || null;

    // Tags / domains
    const rawTags = [
      ...(item.tags  || []),
      ...(item.types || []),
    ].map(t => typeof t === "string" ? t : t.name || "").filter(Boolean);

    const isBlockchain = rawTags.some(t => /web3|blockchain|crypto|defi|nft|dao/i.test(t)) ||
                         /web3|blockchain|crypto/i.test(title);

    if (!rawTags.length && isBlockchain) rawTags.push("Blockchain", "Web3");

    return this.normalise({
      name:                 title.trim(),
      organizer:            item.organizer?.name || item.host || "DoraHacks",
      mode:                 "Online",
      city:                 "Online",
      state:                "",
      country:              item.country || "Global",
      startDate:            start,
      endDate:              end,
      registrationDeadline: regEnd,
      prize,
      teamSizeMin:          item.min_team_size || 1,
      teamSizeMax:          item.max_team_size || 5,
      domains:              rawTags,
      tags:                 [...rawTags, "Web3", "Global"],
      applyLink:            link,
      websiteLink:          link,
      sourceUrl:            "https://dorahacks.io/hackathon",
      externalId:           String(id || title),
      logo:                 item.logo || item.logo_url || item.cover_img || "🌐",
      isFeatured:           Boolean(item.featured || item.is_featured),
      registrationCount:    Number(item.participant_count || item.participants || 0),
    });
  }
}

const _inst = new DoraHacksScraper();
module.exports = { scrape: () => _inst.scrape() };
