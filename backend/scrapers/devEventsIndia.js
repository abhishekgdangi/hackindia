/**
 * scrapers/devEventsIndia.js
 * dev.events — India-specific tech meetups & conferences
 * Fixed: proper city extraction + non-India offline events filtered out
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

// Known India cities to match against
const INDIA_CITIES = [
  "bangalore","bengaluru","mumbai","delhi","hyderabad","pune","chennai",
  "kolkata","noida","gurugram","gurgaon","kochi","jaipur","ahmedabad",
  "indore","bhopal","surat","nagpur","coimbatore","trivandrum","vadodara",
  "chandigarh","lucknow","vizag","visakhapatnam","patna","dehradun","mysore",
  "india", // fallback
];
const INDIA_CITY_RE = new RegExp(`\\b(${INDIA_CITIES.join("|")})\\b`, "i");

// Map common abbreviations/display to proper city names
const CITY_MAP = {
  bengaluru: "Bangalore", bangalore: "Bangalore",
  gurugram: "Gurugram", gurgaon: "Gurugram",
  trivandrum: "Thiruvananthapuram", kochi: "Kochi",
  mumbai: "Mumbai", delhi: "Delhi", hyderabad: "Hyderabad",
  pune: "Pune", chennai: "Chennai", kolkata: "Kolkata",
  noida: "Noida", jaipur: "Jaipur", ahmedabad: "Ahmedabad",
  indore: "Indore", coimbatore: "Coimbatore", vadodara: "Vadodara",
  chandigarh: "Chandigarh", lucknow: "Lucknow", surat: "Surat",
  nagpur: "Nagpur", vizag: "Visakhapatnam", visakhapatnam: "Visakhapatnam",
  patna: "Patna", dehradun: "Dehradun", mysore: "Mysore", bhopal: "Bhopal",
};

async function scrapeDevEventsIndia() {
  logger.info("[DevEventsIndia] Starting scrape…");
  const results = [];
  const seen    = new Set();
  const now     = new Date();

  for (const path of INDIA_PAGES) {
    try {
      const res = await axios.get(`${BASE}${path}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeout: 15000,
      });

      const $ = cheerio.load(res.data);
      let added = 0;

      $("h2 a, h3 a").each((_, el) => {
        try {
          const $a   = $(el);
          const href = $a.attr("href") || "";
          const title = $a.text().trim();
          if (!title || !href || title.length < 3) return;

          const link = href.startsWith("http") ? href : `${BASE}${href}`;
          const uid  = `devevents-india-${href.replace(/\W+/g,"-").slice(0,80)}`;
          if (seen.has(uid)) return;

          const $container = $a.closest("article, section, div.event, li, div").first();
          const fullText   = ($container.text() || $a.parent().parent().text() || "").replace(/\s+/g," ");

          // Extract date
          const dateMatch = fullText.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:[-–]\d{1,2})?,?\s*\d{4}/i)
                         || fullText.match(/\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/i);
          const dateStr   = dateMatch ? dateMatch[0].trim() : "";
          if (dateStr) {
            const d = new Date(dateStr);
            if (!isNaN(d) && d < now) return;
          }

          // Extract city using multiple patterns
          let city = "India";
          const isOnline = /online|virtual|remote/i.test(fullText);

          if (!isOnline) {
            // Try "in City, India" pattern
            const cityPatterns = [
              /\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),?\s*India/i,
              /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),?\s*India/,
              new RegExp(`\\b(${Object.keys(CITY_MAP).join("|")})\\b`, "i"),
            ];
            for (const re of cityPatterns) {
              const m = fullText.match(re);
              if (m) {
                const raw = (m[1] || "").toLowerCase().trim();
                city = CITY_MAP[raw] || m[1].trim();
                break;
              }
            }
          }

          // India-only rule: if not India city and not online → skip
          const cityIsIndia = isOnline || city === "India" || INDIA_CITY_RE.test(city);
          if (!cityIsIndia) return;

          seen.add(uid);
          results.push({
            title,
            description: $(el).find("p, [class*='desc'], [class*='summary']").first().text().trim().slice(0,200) || `${_classify(title + " " + path)} in ${isOnline ? "Online" : city}`,
            eventType:   _classify(title + " " + path),
            platform:    "dev.events",
            date:        dateStr || null,
            location:    isOnline ? "Online" : city,
            mode:        isOnline ? "Online" : "Offline",
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
  if (/conference|summit|conf\b|expo/i.test(t)) return "Conference";
  if (/workshop|training|bootcamp/i.test(t))     return "Workshop";
  if (/\bai\b|llm|ml\b|data\s*sci/i.test(t))    return "AI/ML Event";
  if (/cloud|aws|azure|gcp/i.test(t))            return "Conference";
  if (/devops|kubernetes|docker|k8s/i.test(t))   return "Workshop";
  if (/startup|founder|venture/i.test(t))        return "Startup Event";
  if (/webinar|online\s+talk/i.test(t))          return "Webinar";
  return "Meetup";
}

module.exports = { scrapeDevEventsIndia };
