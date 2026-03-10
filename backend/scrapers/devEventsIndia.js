/**
 * scrapers/devEventsIndia.js
 * dev.events — India-specific tech meetups & conferences
 * Scrapes their HTML (confirmed 20+ India events visible)
 * URL pattern: https://dev.events/meetups/AS/IN/tech
 */
const axios   = require("axios");
const cheerio = require("cheerio");
const logger  = require("../utils/logger");

const BASE = "https://dev.events";

const INDIA_PAGES = [
  "/meetups/AS/IN/tech",
  "/meetups/AS/IN/ai",
  "/meetups/AS/IN/cloud",
  "/meetups/AS/IN/javascript",
  "/meetups/AS/IN/devops",
  "/conferences/AS/IN",
];

async function scrapeDevEventsIndia() {
  logger.info("[DevEventsIndia] Starting scrape…");
  const results = [];
  const seen    = new Set();
  const now     = new Date();

  for (const path of INDIA_PAGES) {
    try {
      const res = await axios.get(`${BASE}${path}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeout: 15000,
      });

      const $ = cheerio.load(res.data);
      let added = 0;

      // Each event is in an <article> or <section> with h2/h3 title + link
      $("h2 a, h3 a").each((_, el) => {
        try {
          const $a   = $(el);
          const href = $a.attr("href") || "";
          const title= $a.text().trim();
          if (!title || !href) return;

          const link = href.startsWith("http") ? href : `${BASE}${href}`;
          const uid  = `devevents-india-${href.replace(/\W+/g,"-").slice(0,80)}`;
          if (seen.has(uid)) return;

          // Get parent container for meta
          const $container = $a.closest("article, section, div.event, li").first();
          const fullText   = $container.text() || "";

          // Extract date — look for month pattern near title
          const dateMatch  = fullText.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:-\d{1,2})?,?\s*\d{2,4}/i);
          const dateStr    = dateMatch ? dateMatch[0].trim() : "";

          // Check if past
          if (dateStr) {
            const d = new Date(dateStr);
            if (!isNaN(d) && d < now) return;
          }

          // Extract city from "meetup in City, India" pattern
          const cityMatch = fullText.match(/meetup in ([A-Za-z\s]+),\s*India/i) ||
                            fullText.match(/conference in ([A-Za-z\s]+),?\s*India/i) ||
                            fullText.match(/in ([A-Za-z]+),\s*India/i);
          const city = cityMatch ? cityMatch[1].trim() : "India";

          seen.add(uid);
          results.push({
            title,
            description: `Tech event in ${city}, India. Source: dev.events`,
            eventType:   _classify(title + " " + path),
            platform:    "dev.events",
            date:        dateStr,
            location:    /online|virtual/i.test(city) ? "Online" : city,
            price:       "Free",
            registrationLink: link,
            imageUrl:    "",
            uniqueId:    uid,
          });
          added++;
        } catch(_) {}
      });

      logger.info(`[DevEventsIndia] ${path}: ${added} events`);
      await new Promise(r => setTimeout(r, 1200));
    } catch (err) {
      logger.warn(`[DevEventsIndia] ${path} failed: ${err.message}`);
    }
  }

  logger.info(`[DevEventsIndia] Total: ${results.length} events`);
  return results;
}

function _classify(t = "") {
  if (/conference|summit|conf\b/i.test(t)) return "Conference";
  if (/workshop|training/i.test(t))         return "Workshop";
  if (/\bai\b|llm|ml\b|data/i.test(t))     return "AI/ML Event";
  if (/cloud|aws|azure|gcp/i.test(t))       return "Conference";
  if (/devops|kubernetes|docker/i.test(t))  return "Workshop";
  return "Meetup";
}

module.exports = { scrapeDevEventsIndia };
