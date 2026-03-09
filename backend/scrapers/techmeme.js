/**
 * scrapers/techmeme.js
 * Techmeme Events — https://www.techmeme.com/events
 * Only keeps India-based or Online events.
 */

const axios   = require("axios");
const cheerio = require("cheerio");
const logger  = require("../utils/logger");

const DATE_PREFIX_RE = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:[-–]\d{1,2})?(?:,?\s*\d{4})?\s*/i;

// India cities / keywords to keep
const INDIA_KEYWORDS = /india|bangalore|bengaluru|mumbai|delhi|hyderabad|pune|chennai|kolkata|noida|gurugram|gurgaon|online|virtual|remote/i;

async function scrapeTechmeme() {
  logger.info("[Techmeme] Starting scrape…");
  const results = [];

  try {
    const res = await axios.get("https://www.techmeme.com/events", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.9",
        "Accept-Language": "en-US,en;q=0.9",
      },
      timeout: 25000,
    });

    const $ = cheerio.load(res.data);

    $("li").each((_, el) => {
      const $el = $(el);
      const $a  = $el.find("a").first();
      if (!$a.length) return;

      const href = $a.attr("href") || "";
      if (!href || href === "#") return;
      const link = href.startsWith("http") ? href : `https://www.techmeme.com${href}`;

      // Extract date from <b> or <strong> inside <a>
      let dateStr = $a.find("b, strong").first().text().trim();

      // Clone and remove date element to get clean title
      const $clone = $a.clone();
      $clone.find("b, strong").remove();
      let title = $clone.text().trim();

      // If date not in child element, strip from prefix
      if (!dateStr) {
        const full  = $a.text().trim();
        const match = full.match(DATE_PREFIX_RE);
        if (match) {
          dateStr = match[0].trim();
          title   = full.replace(DATE_PREFIX_RE, "").trim();
        } else {
          title = full;
        }
      }

      // Safety: if date prefix still stuck to title, strip it
      if (title) {
        const stuck = title.match(DATE_PREFIX_RE);
        if (stuck) {
          dateStr = stuck[0].trim();
          title   = title.replace(DATE_PREFIX_RE, "").trim();
        }
      }

      if (!title || title.length < 4) return;

      // Extract location from end of title e.g. "EventName, Bangalore, India"
      let location = "";
      const locMatch = title.match(/,\s*([A-Z][a-zA-Z\s]+(?:,\s*[A-Za-z\s]+)?)$/);
      if (locMatch) {
        location = locMatch[1].trim();
      }
      if (/online|virtual|remote/i.test(title + " " + location)) location = "Online";

      // ── INDIA FILTER ──────────────────────────────────────────────
      // Only keep events that mention India or Online
      if (!INDIA_KEYWORDS.test(title + " " + location)) return;
      // ─────────────────────────────────────────────────────────────

      if (!location) location = "India";

      const uid = `techmeme-${title.toLowerCase().replace(/\W+/g, "-").slice(0, 60)}`;

      results.push({
        title,
        description: `Tech event in ${location} on ${dateStr || "TBD"}. Source: Techmeme.`,
        eventType:   _classify(title),
        platform:    "Techmeme",
        date:        dateStr,
        location,
        price:       "Unknown",
        registrationLink: link,
        imageUrl:    "",
        uniqueId:    uid,
      });
    });

    logger.info(`[Techmeme] ${results.length} India/Online events scraped`);
  } catch (err) {
    logger.error(`[Techmeme] Failed: ${err.message}`);
  }

  const seen = new Set();
  return results.filter(e => {
    if (seen.has(e.uniqueId)) return false;
    seen.add(e.uniqueId);
    return true;
  });
}

function _classify(title = "") {
  const t = title.toLowerCase();
  if (/summit|conference|congress|forum|expo|world|connect/i.test(t)) return "Conference";
  if (/workshop|training|bootcamp/i.test(t))                          return "Workshop";
  if (/meetup|meet-up/i.test(t))                                      return "Meetup";
  if (/webinar|virtual/i.test(t))                                     return "Webinar";
  if (/hackathon/i.test(t))                                           return "Hackathon";
  if (/\bai\b|ml|machine learning|llm|data/i.test(t))                return "AI/ML Event";
  if (/startup|venture|founder/i.test(t))                             return "Startup Event";
  return "Conference";
}

module.exports = { scrapeTechmeme };
