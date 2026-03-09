/**
 * scrapers/devEventsScraper.js
 * dev.events — global developer events aggregator
 * URL: https://dev.events
 */

const axios   = require("axios");
const cheerio = require("cheerio");
const logger  = require("../utils/logger");

async function scrapeDevEvents() {
  logger.info("[DevEvents] Starting events scrape…");
  const results = [];

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
    Accept: "application/json, text/html, */*;q=0.9",
    "Accept-Language": "en-US,en;q=0.9",
  };

  // dev.events provides a public API
  const API_ENDPOINTS = [
    "https://dev.events/api/events?page=1&per_page=50&category=conference",
    "https://dev.events/api/events?page=1&per_page=50&category=meetup",
    "https://dev.events/api/events?page=1&per_page=50&online=true",
  ];

  for (const url of API_ENDPOINTS) {
    try {
      const res   = await axios.get(url, { headers, timeout: 20000 });
      const items = res.data?.events || res.data?.data || (Array.isArray(res.data) ? res.data : []);

      for (const item of items) {
        const title = (item.name || item.title || "").trim();
        if (!title) continue;

        const uid = `devevents-${item.id || item.slug || title.toLowerCase().replace(/\W+/g, "-").slice(0, 60)}`;
        results.push({
          title,
          description: (item.description || item.abstract || item.tagline || "").slice(0, 300),
          eventType:   _classify(item),
          platform:    "dev.events",
          date:        item.startDate || item.date
            ? new Date(item.startDate || item.date).toLocaleDateString("en-IN")
            : "",
          location: item.city || item.location || (item.online ? "Online" : "Global"),
          price:    item.price === 0 || item.free ? "Free" : item.price ? "Paid" : "Unknown",
          registrationLink: item.url || item.registrationLink || `https://dev.events`,
          imageUrl: item.image || item.imageUrl || "",
          uniqueId: uid,
        });
      }
      logger.info(`[DevEvents] ${url}: ${items.length} events`);
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      logger.warn(`[DevEvents] API ${url} failed: ${err.message}`);
    }
  }

  // Fallback: HTML scrape
  if (results.length === 0) {
    try {
      const res = await axios.get("https://dev.events", { headers, timeout: 25000 });
      const $   = cheerio.load(res.data);

      $("article, [class*='event-card'], [class*='EventCard'], .event").each((_, el) => {
        const title = $(el).find("h2, h3, [class*='title']").first().text().trim();
        if (!title || title.length < 4) return;

        const href  = $(el).find("a[href]").first().attr("href") || "";
        const link  = href.startsWith("http") ? href : `https://dev.events${href}`;
        const date  = $(el).find("time, [class*='date']").first().text().trim();
        const loc   = $(el).find("[class*='location'], [class*='city']").first().text().trim();
        const uid   = `devevents-html-${title.toLowerCase().replace(/\W+/g, "-").slice(0, 60)}`;

        results.push({
          title,
          description: $(el).find("p, [class*='description']").first().text().trim().slice(0, 250),
          eventType:   "Conference",
          platform:    "dev.events",
          date,
          location: loc || "Online",
          price:    "Unknown",
          registrationLink: link,
          imageUrl: $(el).find("img").first().attr("src") || "",
          uniqueId: uid,
        });
      });

      logger.info(`[DevEvents] HTML fallback: ${results.length} events`);
    } catch (htmlErr) {
      logger.error(`[DevEvents] HTML failed: ${htmlErr.message}`);
    }
  }

  const seen = new Set();
  return results.filter(e => {
    if (seen.has(e.uniqueId)) return false;
    seen.add(e.uniqueId);
    return true;
  });
}

function _classify(item) {
  const t = (item.category || item.type || item.name || "").toLowerCase();
  if (t.includes("conference") || t.includes("summit")) return "Conference";
  if (t.includes("workshop"))   return "Workshop";
  if (t.includes("meetup"))     return "Meetup";
  if (t.includes("webinar"))    return "Webinar";
  if (t.includes("hackathon"))  return "Hackathon";
  if (t.includes("bootcamp"))   return "Bootcamp";
  return "Conference";
}

module.exports = { scrapeDevEvents };
