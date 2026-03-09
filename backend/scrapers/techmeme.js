/**
 * scrapers/techmeme.js
 * Techmeme Events — https://www.techmeme.com/events
 *
 * Techmeme renders each event as:
 *   <li><a href="..."><b>Apr 20-23</b>EventName, City</a></li>
 * Date is inside <b>/<strong> WITHIN the <a> tag.
 */

const axios   = require("axios");
const cheerio = require("cheerio");
const logger  = require("../utils/logger");

// Matches date prefix like "Apr 20-23" or "Mar 9" at start of string
const DATE_PREFIX_RE = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:[-–]\d{1,2})?(?:,?\s*\d{4})?\s*/i;

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
      const link = href.startsWith("http") ? href : `https://www.techmeme.com${href}`;

      // Step 1: extract date from bold/strong tag inside <a>
      let dateStr = $a.find("b, strong").first().text().trim();

      // Step 2: clone <a>, remove date element, get clean title
      const $clone = $a.clone();
      $clone.find("b, strong").remove();
      let title = $clone.text().trim();

      // Step 3: if still no date found, try stripping date prefix from full text
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

      // Step 4: if date prefix is still stuck to title, strip it
      if (title) {
        const stuck = title.match(DATE_PREFIX_RE);
        if (stuck) {
          dateStr = stuck[0].trim();
          title   = title.replace(DATE_PREFIX_RE, "").trim();
        }
      }

      if (!title || title.length < 4) return;

      // Step 5: extract location from end of title "EventName, City, Country"
      let location = "Global";
      const locMatch = title.match(/,\s*([A-Z][a-zA-Z\s]+(?:,\s*[A-Z]{2})?)$/);
      if (locMatch) {
        const candidate = locMatch[1].trim();
        if (candidate.split(" ").length <= 5) {
          location = candidate;
          // Don't strip location from title — keep full title
        }
      }
      if (/online|virtual|remote/i.test(title + " " + location)) location = "Online";

      const uid = `techmeme-${title.toLowerCase().replace(/\W+/g, "-").slice(0, 60)}`;

      results.push({
        title,
        description: "",
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

    // Fallback: table layout
    if (results.length === 0) {
      $("table tr").each((_, el) => {
        const cells = $(el).find("td");
        if (cells.length < 2) return;
        const dateStr = $(cells[0]).text().trim();
        const $name   = $(cells[1]);
        const title   = $name.find("a").text().trim() || $name.text().trim();
        if (!title || title.length < 4) return;
        const href = $name.find("a").attr("href") || "";
        const link = href.startsWith("http") ? href : `https://www.techmeme.com${href}`;
        const loc  = cells.length > 2 ? $(cells[2]).text().trim() : "Global";
        const uid  = `techmeme-tbl-${title.toLowerCase().replace(/\W+/g, "-").slice(0, 60)}`;
        results.push({
          title, description: "", eventType: _classify(title),
          platform: "Techmeme", date: dateStr, location: loc || "Global",
          price: "Unknown", registrationLink: link || "https://www.techmeme.com/events",
          imageUrl: "", uniqueId: uid,
        });
      });
    }

    logger.info(`[Techmeme] ${results.length} events scraped`);
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
  if (/summit|conference|congress|forum|expo|world/i.test(t)) return "Conference";
  if (/workshop|training|bootcamp/i.test(t))                  return "Workshop";
  if (/meetup|meet-up/i.test(t))                              return "Meetup";
  if (/webinar|virtual/i.test(t))                             return "Webinar";
  if (/hackathon/i.test(t))                                   return "Hackathon";
  if (/\bai\b|ml|machine learning|llm/i.test(t))             return "AI/ML Event";
  if (/startup|venture|founder/i.test(t))                     return "Startup Event";
  return "Conference";
}

module.exports = { scrapeTechmeme };
