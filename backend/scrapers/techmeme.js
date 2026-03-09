/**
 * scrapers/techmeme.js
 * Techmeme Events — https://www.techmeme.com/events
 */

const axios   = require("axios");
const cheerio = require("cheerio");
const logger  = require("../utils/logger");

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

    // Techmeme events page: each event is in a <li> with date, name, location
    $("li.rhov, li.event, .rhov").each((_, el) => {
      const title  = $(el).find("a").first().text().trim();
      const href   = $(el).find("a").first().attr("href") || "";
      const link   = href.startsWith("http") ? href : `https://www.techmeme.com${href}`;

      if (!title || title.length < 4) return;

      // Date and location are typically in <span> elements
      const spans   = $(el).find("span").map((_, s) => $(s).text().trim()).get();
      const dateStr = spans.find(s => /\d{4}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i.test(s)) || "";
      const loc     = spans.find(s => /online|virtual|,\s*[A-Z]{2}|[A-Z][a-z]+\s+[A-Z]{2}/i.test(s)) || "Global";

      const uid = `techmeme-${title.toLowerCase().replace(/\W+/g, "-").slice(0, 60)}`;

      results.push({
        title,
        description: spans.filter(s => s !== dateStr && s !== loc && s.length > 10).join(" ").slice(0, 300),
        eventType:   "Conference",
        platform:    "Techmeme",
        date:        dateStr,
        location:    loc || "Global",
        price:       "Unknown",
        registrationLink: link,
        imageUrl:    "",
        uniqueId:    uid,
      });
    });

    // Alternative selector — Techmeme may use table or div-based layout
    if (results.length === 0) {
      $("table tr, .event-row, [class*='event']").each((_, el) => {
        const cells = $(el).find("td, div").map((_, c) => $(c).text().trim()).get().filter(Boolean);
        if (cells.length < 2) return;

        const title = cells[0];
        if (!title || title.length < 5) return;

        const linkEl = $(el).find("a[href]").first();
        const href   = linkEl.attr("href") || "";
        const link   = href.startsWith("http") ? href : `https://www.techmeme.com${href}`;

        const uid = `techmeme-tbl-${title.toLowerCase().replace(/\W+/g, "-").slice(0, 60)}`;
        results.push({
          title,
          description: cells.slice(2).join(" ").slice(0, 200),
          eventType:   "Conference",
          platform:    "Techmeme",
          date:        cells[1] || "",
          location:    cells[2] || "Global",
          price:       "Unknown",
          registrationLink: link || "https://www.techmeme.com/events",
          imageUrl:    "",
          uniqueId:    uid,
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

module.exports = { scrapeTechmeme };
