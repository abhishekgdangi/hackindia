/**
 * scrapers/googleDev.js
 * Google Developers events — developers.google.com/events
 */

const axios   = require("axios");
const cheerio = require("cheerio");
const logger  = require("../utils/logger");

async function scrapeGoogleDev() {
  logger.info("[GoogleDev] Starting scrape…");
  const results = [];

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,*/*;q=0.9",
    "Accept-Language": "en-IN,en;q=0.9",
  };

  // Google Developers Events uses a public JSON feed in addition to HTML
  try {
    const jsonRes = await axios.get(
      "https://developers.google.com/events/api/events.json",
      { headers, timeout: 20000 }
    );
    const items = jsonRes.data?.events || jsonRes.data || [];
    const arr   = Array.isArray(items) ? items : [];

    for (const item of arr) {
      const title = (item.name || item.title || "").trim();
      if (!title) continue;

      const uid = `googledev-${item.id || title.toLowerCase().replace(/\W+/g, "-").slice(0, 60)}`;
      results.push({
        title,
        description: (item.description || item.summary || "").slice(0, 300),
        eventType:   _classifyGoogleEvent(item),
        platform:    "Google Developers",
        date:        item.startDate || item.date
          ? new Date(item.startDate || item.date).toLocaleDateString("en-IN")
          : "",
        location: item.location || item.city || "Online",
        price:    "Free",
        registrationLink: item.registrationLink || item.url || "https://developers.google.com/events",
        imageUrl: item.imageUrl || item.banner || "",
        uniqueId: uid,
      });
    }
    logger.info(`[GoogleDev] JSON API: ${results.length} events`);
  } catch (apiErr) {
    logger.warn(`[GoogleDev] JSON API failed: ${apiErr.message}`);
  }

  // Fallback: HTML scrape
  if (results.length === 0) {
    try {
      const res = await axios.get("https://developers.google.com/events", {
        headers,
        timeout: 25000,
      });
      const $ = cheerio.load(res.data);

      // Try JSON-LD structured data first
      $("script[type='application/ld+json']").each((_, el) => {
        try {
          const data  = JSON.parse($(el).html());
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
            if (!["Event", "BusinessEvent"].includes(item["@type"])) continue;
            const title = (item.name || "").trim();
            if (!title) continue;
            const uid = `googledev-ld-${title.toLowerCase().replace(/\W+/g, "-").slice(0, 60)}`;
            results.push({
              title,
              description: (item.description || "").slice(0, 300),
              eventType:   "Conference",
              platform:    "Google Developers",
              date:        item.startDate
                ? new Date(item.startDate).toLocaleDateString("en-IN")
                : "",
              location: item.location?.name || "Online",
              price:    "Free",
              registrationLink: item.url || "https://developers.google.com/events",
              imageUrl: item.image || "",
              uniqueId: uid,
            });
          }
        } catch (_) {}
      });

      // DOM-based fallback
      if (results.length === 0) {
        $("[class*='event-card'], [class*='EventCard'], article, .devsite-landing-row-item").each((_, el) => {
          const title = $(el).find("h2, h3, h4, [class*='title']").first().text().trim();
          if (!title || title.length < 5) return;

          const href = $(el).find("a[href]").first().attr("href") || "";
          const link = href.startsWith("http")
            ? href
            : `https://developers.google.com${href}`;

          const dateText = $(el).find("time, [class*='date']").first().text().trim() ||
                           $(el).find("time").attr("datetime") || "";
          const locText  = $(el).find("[class*='location'], [class*='venue']").first().text().trim();

          const uid = `googledev-html-${title.toLowerCase().replace(/\W+/g, "-").slice(0, 60)}`;
          results.push({
            title,
            description: $(el).find("p, [class*='description']").first().text().trim().slice(0, 250),
            eventType:   "Conference",
            platform:    "Google Developers",
            date:        dateText,
            location:    locText || "Online",
            price:       "Free",
            registrationLink: link || "https://developers.google.com/events",
            imageUrl:    $(el).find("img").first().attr("src") || "",
            uniqueId:    uid,
          });
        });
      }

      logger.info(`[GoogleDev] HTML: ${results.length} events`);
    } catch (htmlErr) {
      logger.error(`[GoogleDev] HTML failed: ${htmlErr.message}`);
    }
  }

  const seen = new Set();
  return results.filter(e => {
    if (seen.has(e.uniqueId)) return false;
    seen.add(e.uniqueId);
    return true;
  });
}

function _classifyGoogleEvent(item) {
  const name = (item.name || item.title || item.type || "").toLowerCase();
  if (name.includes("io") || name.includes("summit") || name.includes("cloud next")) return "Conference";
  if (name.includes("devfest"))     return "Conference";
  if (name.includes("workshop"))    return "Workshop";
  if (name.includes("study jam"))   return "Workshop";
  if (name.includes("meetup"))      return "Meetup";
  if (name.includes("hackathon"))   return "Hackathon";
  if (name.includes("gdg"))         return "Meetup";
  return "Conference";
}

module.exports = { scrapeGoogleDev };
