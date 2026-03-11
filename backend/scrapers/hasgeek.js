/**
 * scrapers/hasgeek.js
 * HasGeek — India's premier developer event platform
 * hasgeek.com hosts JSFoo, Meta Refresh, RootConf, PyCon India, etc.
 * Uses their sitemap + event listing page
 */
const axios   = require("axios");
const cheerio = require("cheerio");
const logger  = require("../utils/logger");


// Normalize city name to proper Indian city
function normalizeCity(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  if (t.includes("bengaluru") || t.includes("bangalore")) return "Bengaluru";
  if (t.includes("mumbai") || t.includes("bombay")) return "Mumbai";
  if (t.includes("delhi") || t.includes("new delhi")) return "New Delhi";
  if (t.includes("hyderabad")) return "Hyderabad";
  if (t.includes("pune")) return "Pune";
  if (t.includes("chennai") || t.includes("madras")) return "Chennai";
  if (t.includes("kolkata") || t.includes("calcutta")) return "Kolkata";
  if (t.includes("noida")) return "Noida";
  if (t.includes("gurugram") || t.includes("gurgaon")) return "Gurugram";
  if (t.includes("ahmedabad")) return "Ahmedabad";
  if (t.includes("jaipur")) return "Jaipur";
  if (t.includes("kochi") || t.includes("cochin")) return "Kochi";
  if (t.includes("chandigarh")) return "Chandigarh";
  if (t.includes("indore")) return "Indore";
  if (t.includes("bhopal")) return "Bhopal";
  if (t.includes("lucknow")) return "Lucknow";
  if (t.includes("surat")) return "Surat";
  if (t.includes("nagpur")) return "Nagpur";
  if (t.includes("coimbatore")) return "Coimbatore";
  if (t.includes("visakhapatnam") || t.includes("vizag")) return "Visakhapatnam";
  if (t.includes("online") || t.includes("virtual") || t.includes("remote")) return null; // handled separately
  // Return cleaned version of original if it's a short city name
  if (text.length < 30 && !text.includes(",")) return text.trim();
  return null;
}

async function scrapeHasGeek() {
  logger.info("[HasGeek] Starting scrape…");
  const results = [];
  const seen    = new Set();
  const now     = new Date();

  const urls = [
    "https://hasgeek.com/",           // ✅ 22 events
    "https://hasgeek.com/rootconf",   // ✅ 17 events
    "https://hasgeek.com/jsfoo",      // ✅ 2 events
    "https://hasgeek.com/metarefresh",// ✅ 1 event
    "https://hasgeek.com/droidconin", // ✅ 1 event
    "https://hasgeek.com/generativeAI",// ✅ 11 events
    "https://hasgeek.com/fifthelephant",
    "https://hasgeek.com/PyConIndia",
  ];

  for (const url of urls) {
    try {
      const res = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0",
          Accept: "text/html,application/xhtml+xml",
        },
        timeout: 15000,
      });
      const $ = cheerio.load(res.data);
      let added = 0;

      // HasGeek event cards
      $("a.card, .card a, article a, .event-item a, h2 a, h3 a").each((_, el) => {
        try {
          const $a   = $(el);
          const href = $a.attr("href") || "";
          if (!href || href === "/" || href === "#") return;

          const link = href.startsWith("http") ? href : `https://hasgeek.com${href}`;
          if (!link.includes("hasgeek.com")) return;

          const $card = $a.closest("article, section, .card, li, div").first();
          const title = ($card.find("h2,h3,h4,.title,.name").first().text() || $a.text()).trim();
          if (!title || title.length < 5) return;

          const uid = `hasgeek-${href.replace(/\W+/g,"-").slice(0,80)}`;
          if (seen.has(uid)) return;

          const dateText = $card.find(".date, time, [datetime]").first().text().trim();
          const locText  = $card.find(".location, .venue, .city").first().text().trim();

          // Check if past
          if (dateText) {
            const d = new Date(dateText);
            if (!isNaN(d) && d < now) return;
          }

          seen.add(uid);
          results.push({
            title,
            description: $card.find("p, .description, .summary").first().text().trim().slice(0,300)
              || `Developer event by HasGeek in India.`,
            eventType:   _classify(title),
            platform:    "HasGeek",
            date:        dateText,
            location:    normalizeCity(locText) || "India",
            price:       "Unknown",
            registrationLink: link,
            imageUrl:    $card.find("img").first().attr("src") || "",
            uniqueId:    uid,
          });
          added++;
        } catch(_) {}
      });

      if (added > 0) {
        logger.info(`[HasGeek] ${url}: ${added} events`);
      }
    } catch (err) {
      logger.warn(`[HasGeek] ${url} failed: ${err.message}`);
    }
  }

  logger.info(`[HasGeek] Total: ${results.length} events`);
  return results;
}

function _classify(t = "") {
  if (/conf|summit|fest/i.test(t))            return "Conference";
  if (/workshop|sprint|codesprint/i.test(t))  return "Workshop";
  if (/\bai\b|ml\b|data|python/i.test(t))     return "AI/ML Event";
  if (/meetup|talk|session/i.test(t))         return "Meetup";
  return "Conference";
}

module.exports = { scrapeHasGeek };
