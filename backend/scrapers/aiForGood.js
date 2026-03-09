/**
 * scrapers/aiForGood.js
 * AI for Good — ITU events calendar
 * URL: https://aiforgood.itu.int/ai-events-calendar/
 */

const axios   = require("axios");
const cheerio = require("cheerio");
const logger  = require("../utils/logger");

async function scrapeAiForGood() {
  logger.info("[AiForGood] Starting scrape…");
  const results = [];

  try {
    const res = await axios.get("https://aiforgood.itu.int/ai-events-calendar/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.9",
        "Accept-Language": "en-US,en;q=0.9",
      },
      timeout: 25000,
    });

    const $ = cheerio.load(res.data);

    // Common event card patterns used by WordPress-based event plugins (The Events Calendar, tribe_events)
    const selectors = [
      ".tribe-events-calendar td .tribe-events-tooltip",
      ".tribe_events_cat",
      "article.type-tribe_events",
      ".tribe-event-url",
      ".tribe-events-list-event",
      ".tribe-events-loop .tribe-events-event",
      "[class*='tribe-events']",
    ];

    for (const sel of selectors) {
      $(sel).each((_, el) => {
        const title = $(el).find(".tribe-event-url, h2, h3, a").first().text().trim() ||
                      $(el).attr("title") || "";
        if (!title || title.length < 4) return;

        const href  = $(el).find("a[href]").first().attr("href") ||
                      $(el).find("[class*='url']").first().attr("href") || "";
        const link  = href.startsWith("http") ? href : `https://aiforgood.itu.int${href}`;

        const dateText = $(el).find(
          ".tribe-event-date-start, time, [class*='date'], [class*='start']"
        ).first().text().trim();

        const locText = $(el).find(
          ".tribe-venue, .tribe-address, [class*='location'], [class*='venue']"
        ).first().text().trim();

        const uid = `aiforgood-${title.toLowerCase().replace(/\W+/g, "-").slice(0, 60)}`;

        results.push({
          title,
          description: $(el).find(".tribe-events-list-event-description, p").first().text().trim().slice(0, 300),
          eventType:   "AI/ML Event",
          platform:    "AI for Good (ITU)",
          date:        dateText || "",
          location:    locText || "Online",
          price:       "Free",
          registrationLink: link || "https://aiforgood.itu.int/ai-events-calendar/",
          imageUrl:    $(el).find("img").first().attr("src") || "",
          uniqueId:    uid,
        });
      });
    }

    // Also try JSON-LD structured data on the page
    $("script[type='application/ld+json']").each((_, el) => {
      try {
        const data = JSON.parse($(el).html());
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item["@type"] !== "Event") continue;
          const title = (item.name || "").trim();
          if (!title) continue;
          const uid = `aiforgood-ld-${title.toLowerCase().replace(/\W+/g, "-").slice(0, 60)}`;
          results.push({
            title,
            description: (item.description || "").slice(0, 300),
            eventType:   "AI/ML Event",
            platform:    "AI for Good (ITU)",
            date:        item.startDate
              ? new Date(item.startDate).toLocaleDateString("en-IN")
              : "",
            location: item.location?.name || item.location?.address?.addressLocality || "Online",
            price:    "Free",
            registrationLink: item.url || "https://aiforgood.itu.int/ai-events-calendar/",
            imageUrl: item.image || "",
            uniqueId: uid,
          });
        }
      } catch (_) {}
    });

    logger.info(`[AiForGood] ${results.length} events scraped`);
  } catch (err) {
    logger.error(`[AiForGood] Failed: ${err.message}`);
  }

  const seen = new Set();
  return results.filter(e => {
    if (seen.has(e.uniqueId)) return false;
    seen.add(e.uniqueId);
    return true;
  });
}

module.exports = { scrapeAiForGood };
