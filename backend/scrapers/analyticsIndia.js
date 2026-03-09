/**
 * scrapers/analyticsIndia.js
 * Analytics India Magazine — Indian AI/Data Science events
 * URL: https://analyticsindiamag.com/events/
 */

const axios   = require("axios");
const cheerio = require("cheerio");
const logger  = require("../utils/logger");

async function scrapeAnalyticsIndia() {
  logger.info("[AnalyticsIndia] Starting scrape…");
  const results = [];

  try {
    const res = await axios.get("https://analyticsindiamag.com/events/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.9",
        "Accept-Language": "en-IN,en;q=0.9",
        Referer: "https://www.google.com/",
      },
      timeout: 25000,
    });

    const $ = cheerio.load(res.data);

    // AIM typically uses WordPress + The Events Calendar or custom cards
    const selectors = [
      "article.type-tribe_events",
      ".tribe-events-loop article",
      "[class*='event-card']",
      ".events-list .event",
      ".post-type-tribe_events",
      "article[class*='event']",
    ];

    for (const sel of selectors) {
      $(sel).each((_, el) => {
        const title = $(el).find("h2 a, h3 a, h2, h3, .entry-title").first().text().trim();
        if (!title || title.length < 4) return;

        const href = $(el).find("a[href]").first().attr("href") || "";
        const link = href.startsWith("http") ? href : `https://analyticsindiamag.com${href}`;

        const dateText = $(el).find(
          ".tribe-event-date-start, time, [class*='date'], .event-date"
        ).first().text().trim();

        const locText = $(el).find(
          ".tribe-venue, [class*='location'], .event-location"
        ).first().text().trim();

        const priceText = $(el).find("[class*='price'], .event-cost").first().text().trim().toLowerCase();
        const price     = priceText.includes("free") ? "Free" : priceText ? "Paid" : "Unknown";

        const uid = `aim-${title.toLowerCase().replace(/\W+/g, "-").slice(0, 60)}`;
        results.push({
          title,
          description: $(el).find(".tribe-events-list-event-description, p, .entry-summary")
            .first().text().trim().slice(0, 300),
          eventType:   "AI/ML Event",
          platform:    "Analytics India Mag",
          date:        dateText || "",
          location:    locText || "India",
          price,
          registrationLink: link || "https://analyticsindiamag.com/events/",
          imageUrl:    $(el).find("img").first().attr("src") || "",
          uniqueId:    uid,
        });
      });

      if (results.length > 0) break;
    }

    // JSON-LD fallback
    if (results.length === 0) {
      $("script[type='application/ld+json']").each((_, el) => {
        try {
          const data  = JSON.parse($(el).html());
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
            if (!["Event", "BusinessEvent", "EducationEvent"].includes(item["@type"])) continue;
            const title = (item.name || "").trim();
            if (!title) continue;
            const uid = `aim-ld-${title.toLowerCase().replace(/\W+/g, "-").slice(0, 60)}`;
            results.push({
              title,
              description: (item.description || "").slice(0, 300),
              eventType:   "AI/ML Event",
              platform:    "Analytics India Mag",
              date:        item.startDate
                ? new Date(item.startDate).toLocaleDateString("en-IN")
                : "",
              location: item.location?.name || "India",
              price:    "Unknown",
              registrationLink: item.url || "https://analyticsindiamag.com/events/",
              imageUrl: item.image || "",
              uniqueId: uid,
            });
          }
        } catch (_) {}
      });
    }

    logger.info(`[AnalyticsIndia] ${results.length} events scraped`);
  } catch (err) {
    logger.error(`[AnalyticsIndia] Failed: ${err.message}`);
  }

  const seen = new Set();
  return results.filter(e => {
    if (seen.has(e.uniqueId)) return false;
    seen.add(e.uniqueId);
    return true;
  });
}

module.exports = { scrapeAnalyticsIndia };
