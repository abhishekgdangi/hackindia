/**
 * scrapers/eventbriteScraper.js
 * Eventbrite — tech events (Online + India)
 */

const axios   = require("axios");
const cheerio = require("cheerio");
const logger  = require("../utils/logger");

async function scrapeEventbrite() {
  logger.info("[Eventbrite] Starting scrape…");
  const results = [];

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,*/*;q=0.9",
    "Accept-Language": "en-IN,en;q=0.9",
  };

  const URLS = [
    "https://www.eventbrite.com/d/online/tech--events/?page=1",
    "https://www.eventbrite.com/d/india/tech--events/?page=1",
  ];

  for (const url of URLS) {
    try {
      const res = await axios.get(url, { headers, timeout: 25000 });
      const $   = cheerio.load(res.data);

      // Look for __NEXT_DATA__ first
      const nd = $("script#__NEXT_DATA__").html();
      if (nd) {
        try {
          const json   = JSON.parse(nd);
          const edges  =
            json?.props?.pageProps?.serverPayload?.search_result?.events?.results ||
            json?.props?.pageProps?.events ||
            [];

          for (const evt of edges) {
            const title = (evt.name || evt.title || "").trim();
            if (!title) continue;

            const uid = `eventbrite-${evt.id || title.toLowerCase().replace(/\W+/g, "-").slice(0, 50)}`;
            results.push({
              title,
              description: (evt.summary || evt.description || "").slice(0, 300),
              eventType: "Conference",
              platform:  "Eventbrite",
              date:      evt.start?.local
                ? new Date(evt.start.local).toLocaleDateString("en-IN")
                : evt.start_date || "",
              location: evt.venue?.city || (evt.online_event ? "Online" : "Global"),
              price:    evt.is_free || evt.ticket_availability?.is_free ? "Free" : "Paid",
              registrationLink: evt.url || `https://www.eventbrite.com`,
              imageUrl: evt.logo?.url || evt.image?.url || "",
              uniqueId: uid,
            });
          }
          logger.info(`[Eventbrite] __NEXT_DATA__ from ${url}: ${edges.length} events`);
        } catch (_) {}
      }

      // Fallback: HTML card parsing
      if (results.length === 0) {
        $("[data-event-id], article[class*='event'], .search-event-card-wrapper").each((_, el) => {
          const title = $(el).find("h2, h3, [class*='title']").first().text().trim();
          if (!title) return;

          const href = $(el).find("a[href*='eventbrite']").first().attr("href") ||
                       $(el).find("a[href]").first().attr("href") || "";
          const link = href.startsWith("http") ? href : `https://www.eventbrite.com${href}`;

          const dateText = $(el).find("time, [class*='date']").first().text().trim();
          const locText  = $(el).find("[class*='location'], [class*='venue']").first().text().trim();
          const isFree   = $(el).find("[class*='price']").text().toLowerCase().includes("free");

          const uid = `eventbrite-html-${title.toLowerCase().replace(/\W+/g, "-").slice(0, 60)}`;
          results.push({
            title,
            description: $(el).find("[class*='summary'], p").first().text().trim().slice(0, 200),
            eventType: "Conference",
            platform:  "Eventbrite",
            date:      dateText,
            location:  locText || "Online",
            price:     isFree ? "Free" : "Paid",
            registrationLink: link,
            imageUrl:  $(el).find("img").first().attr("src") || "",
            uniqueId:  uid,
          });
        });
      }

      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      logger.warn(`[Eventbrite] ${url} failed: ${err.message}`);
    }
  }

  logger.info(`[Eventbrite] Total: ${results.length} events`);

  const seen = new Set();
  return results.filter(e => {
    if (seen.has(e.uniqueId)) return false;
    seen.add(e.uniqueId);
    return true;
  });
}

module.exports = { scrapeEventbrite };
