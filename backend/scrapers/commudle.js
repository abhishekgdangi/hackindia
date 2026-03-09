/**
 * scrapers/commudle.js
 * Commudle — Indian tech community events
 * URL: https://www.commudle.com/all-events
 */

const axios   = require("axios");
const cheerio = require("cheerio");
const logger  = require("../utils/logger");

async function scrapeCommudle() {
  logger.info("[Commudle] Starting scrape…");
  const results = [];

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9",
    Referer: "https://www.commudle.com/",
  };

  try {
    // Try the public API first — Commudle exposes a JSON feed
    const apiRes = await axios.get(
      "https://www.commudle.com/api/v2/events?page=1&per_page=50",
      { headers, timeout: 20000 }
    );
    const items = apiRes.data?.events || apiRes.data?.data || [];

    for (const item of items) {
      try {
        const title = (item.name || item.title || "").trim();
        if (!title) continue;

        const slug  = item.slug || item.id;
        const link  = slug
          ? `https://www.commudle.com/events/${slug}`
          : "https://www.commudle.com/all-events";

        const location = item.location || item.city || item.venue_address || "Online";
        const date =
          item.starts_at || item.date || item.event_date || item.start_date || "";

        results.push({
          title,
          description: (item.tagline || item.description || "").slice(0, 400),
          eventType:   "Meetup",
          platform:    "Commudle",
          date:        date ? new Date(date).toLocaleDateString("en-IN") : "",
          location:    location.toString().trim(),
          price:       "Free",
          registrationLink: link,
          imageUrl:    item.banner_image || item.cover_image || "",
          uniqueId:    `commudle-${item.id || slug || title.toLowerCase().replace(/\s+/g, "-")}`,
        });
      } catch (parseErr) {
        // skip individual malformed items
      }
    }

    logger.info(`[Commudle] API: ${results.length} events`);
  } catch (apiErr) {
    logger.warn(`[Commudle] API failed (${apiErr.message}), trying HTML scrape…`);

    // Fallback: HTML scrape the events page
    try {
      const res = await axios.get("https://www.commudle.com/all-events", {
        headers,
        timeout: 25000,
      });
      const $ = cheerio.load(res.data);

      // Commudle renders event cards with Angular, so try to find static rendered content
      $("app-event-card, [class*='event-card'], [class*='EventCard'], article").each((_, el) => {
        const titleEl  = $(el).find("h2, h3, h4, [class*='title'], [class*='name']").first();
        const title    = titleEl.text().trim();
        if (!title || title.length < 4) return;

        const linkEl   = $(el).find("a[href]").first();
        const href     = linkEl.attr("href") || "";
        const link     = href.startsWith("http") ? href : `https://www.commudle.com${href}`;

        const dateEl   = $(el).find("[class*='date'], time").first();
        const dateText = dateEl.text().trim() || dateEl.attr("datetime") || "";

        const locEl    = $(el).find("[class*='location'], [class*='city']").first();
        const locText  = locEl.text().trim() || "India";

        const uid = `commudle-html-${title.toLowerCase().replace(/\W+/g, "-").slice(0, 50)}`;

        results.push({
          title,
          description: $(el).find("[class*='desc'], p").first().text().trim().slice(0, 300),
          eventType:   "Meetup",
          platform:    "Commudle",
          date:        dateText,
          location:    locText,
          price:       "Free",
          registrationLink: link || "https://www.commudle.com/all-events",
          imageUrl:    $(el).find("img").first().attr("src") || "",
          uniqueId:    uid,
        });
      });

      // If Angular SSR didn't render cards, inject some known community events
      if (results.length === 0) {
        logger.warn("[Commudle] No events found in HTML — Angular likely CSR only");
      }

      logger.info(`[Commudle] HTML: ${results.length} events`);
    } catch (htmlErr) {
      logger.error(`[Commudle] HTML scrape failed: ${htmlErr.message}`);
    }
  }

  // Dedup
  const seen = new Set();
  return results.filter(e => {
    if (seen.has(e.uniqueId)) return false;
    seen.add(e.uniqueId);
    return true;
  });
}

module.exports = { scrapeCommudle };
