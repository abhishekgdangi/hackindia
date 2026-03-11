/**
 * scrapers/googleDev.js
 * Google Developers events — India only via developers.google.com/events
 */

const axios   = require("axios");
const cheerio = require("cheerio");
const logger  = require("../utils/logger");

const INDIA_KEYWORDS = ["india","bangalore","bengaluru","mumbai","delhi","hyderabad",
  "pune","chennai","kolkata","noida","gurugram","gurgaon","kochi","ahmedabad",
  "jaipur","indore","chandigarh","lucknow"];

const NON_INDIA_CITIES = ["berlin","warsaw","london","paris","tokyo","singapore","dubai",
  "new york","san francisco","seattle","toronto","sydney","amsterdam","zurich",
  "stockholm","oslo","helsinki","copenhagen","vienna","brussels","rome","madrid",
  "barcelona","lisbon","prague","budapest","bucharest","lagos","nairobi","cairo"];

function isIndia(text) {
  const t = (text || "").toLowerCase();
  return INDIA_KEYWORDS.some(k => t.includes(k));
}

function isNonIndia(text) {
  const t = (text || "").toLowerCase();
  return NON_INDIA_CITIES.some(k => t.includes(k));
}


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

async function scrapeGoogleDev() {
  logger.info("[GoogleDev] Starting scrape…");
  const results = [];

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,*/*;q=0.9",
    "Accept-Language": "en-IN,en;q=0.9",
  };

  // Try the HTML page
  try {
    const res = await axios.get("https://developers.google.com/events", {
      headers, timeout: 25000,
    });
    const $ = cheerio.load(res.data);

    // JSON-LD structured data
    $("script[type='application/ld+json']").each((_, el) => {
      try {
        const data  = JSON.parse($(el).html());
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (!["Event","BusinessEvent","SocialEvent"].includes(item["@type"])) continue;
          const title = (item.name || "").trim();
          if (!title) continue;

          const loc = item.location?.name || item.location?.address?.addressLocality || "";
          const country = item.location?.address?.addressCountry || "";
          const isOnline = (item.eventAttendanceMode || "").toLowerCase().includes("online");

          // Keep only India or Online events
          if (!isOnline && country && country.toLowerCase() !== "in" && !isIndia(loc)) continue;
          // Also filter by title — skip if title contains a non-India city name
          if (isNonIndia(title)) continue;

          const evtUrl = item.url || "";
          if (!evtUrl) continue;

          const uid = `googledev-ld-${evtUrl.split("/").pop() || title.toLowerCase().replace(/\W+/g,"-").slice(0,60)}`;
          results.push({
            title,
            description: (item.description || "").slice(0, 300),
            eventType: _classifyGoogleEvent(title),
            platform: "Google Developers",
            date: item.startDate ? new Date(item.startDate).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}) : "",
            location: isOnline ? "Online" : (normalizeCity(loc) || "India"),
            mode: isOnline ? "Online" : "Offline",
            price: "Free",
            registrationLink: evtUrl,
            imageUrl: item.image || "",
            uniqueId: uid,
          });
        }
      } catch (_) {}
    });

    // DOM fallback
    if (results.length === 0) {
      $("[class*='event-card'], [class*='EventCard'], article, .devsite-landing-row-item").each((_, el) => {
        const title = $(el).find("h2,h3,h4,[class*='title']").first().text().trim();
        if (!title || title.length < 5) return;

        const href = $(el).find("a[href]").first().attr("href") || "";
        const link = href.startsWith("http") ? href : `https://developers.google.com${href}`;
        const locText = $(el).find("[class*='location'],[class*='venue']").first().text().trim();
        const dateText = $(el).find("time,[class*='date']").first().text().trim();
        const isOnline = locText.toLowerCase().includes("online");

        // India-only filter
        if (!isOnline && locText && !isIndia(locText)) return;
        // Skip if title contains non-India city
        if (isNonIndia(title)) return;

        const uid = `googledev-html-${link.split("/").slice(-2).join("-").replace(/\W+/g,"-").slice(0,60)}`;
        if (results.some(r => r.uniqueId === uid)) return;

        results.push({
          title,
          description: $(el).find("p,[class*='description']").first().text().trim().slice(0, 250),
          eventType: _classifyGoogleEvent(title),
          platform: "Google Developers",
          date: dateText,
          location: isOnline ? "Online" : (normalizeCity(locText) || "India"),
          mode: isOnline ? "Online" : "Offline",
          price: "Free",
          registrationLink: link,
          imageUrl: $(el).find("img").first().attr("src") || "",
          uniqueId: uid,
        });
      });
    }

    logger.info(`[GoogleDev] HTML: ${results.length} events`);
  } catch (err) {
    logger.error(`[GoogleDev] HTML failed: ${err.message}`);
  }

  const seen = new Set();
  return results.filter(e => {
    if (seen.has(e.uniqueId)) return false;
    seen.add(e.uniqueId);
    return true;
  });
}

function _classifyGoogleEvent(title) {
  const t = (title || "").toLowerCase();
  if (t.includes("devfest") || t.includes("summit") || t.includes("io ") || t.includes("next")) return "Conference";
  if (t.includes("workshop") || t.includes("study jam") || t.includes("lab")) return "Workshop";
  if (t.includes("meetup") || t.includes("gdg")) return "Meetup";
  if (t.includes("hackathon")) return "Hackathon";
  return "Conference";
}

module.exports = { scrapeGoogleDev };
