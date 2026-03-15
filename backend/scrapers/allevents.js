/**
 * scrapers/allevents.js
 * AllEvents.in — India's largest local events platform
 * Covers tech events, meetups, workshops across all major cities
 */
const axios   = require("axios");
const cheerio = require("cheerio");
const logger  = require("../utils/logger");

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,*/*;q=0.9",
  "Accept-Language": "en-IN,en;q=0.9",
};

const CITY_URLS = [
  { city: "Bengaluru",  url: "https://allevents.in/bangalore/tech" },
  { city: "Mumbai",     url: "https://allevents.in/mumbai/tech" },
  { city: "Hyderabad",  url: "https://allevents.in/hyderabad/tech" },
  { city: "Delhi",      url: "https://allevents.in/delhi/tech" },
  { city: "Chennai",    url: "https://allevents.in/chennai/tech" },
  { city: "Bengaluru",  url: "https://allevents.in/bangalore/workshop" },
  { city: "Mumbai",     url: "https://allevents.in/mumbai/workshop" },
  { city: "Kolkata",    url: "https://allevents.in/kolkata/tech" },
  { city: "Pune",       url: "https://allevents.in/pune/technology" },
];

async function scrapeAllEvents() {
  logger.info("[AllEvents] Starting scrape…");
  const results = [];
  const seen    = new Set();

  for (const { city, url } of CITY_URLS) {
    try {
      const res = await axios.get(url, { headers: HEADERS, timeout: 20000 });
      const $   = cheerio.load(res.data);
      let added = 0;

      // Try JSON-LD first
      $("script[type='application/ld+json']").each((_, el) => {
        try {
          const data  = JSON.parse($(el).html());
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
            if (!["Event","BusinessEvent","SocialEvent","EducationEvent"].includes(item["@type"])) continue;
            const title = (item.name || "").trim();
            if (!title || title.length < 5) return;
            const link  = item.url || "";
            if (!link) return;
            const uid = `allevents-${link.split("/").slice(-2).join("-").replace(/\W+/g,"-").slice(0,70)}`;
            if (seen.has(uid)) return;
            seen.add(uid);
            const isOnline = (item.eventAttendanceMode||"").toLowerCase().includes("online");
            const loc = item.location?.address?.addressLocality || item.location?.name || city;
            results.push({
              title,
              description: (item.description||"").slice(0,250),
              eventType: _classify(title),
              platform: "AllEvents",
              date: item.startDate ? new Date(item.startDate).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}) : "",
              location: isOnline ? "Online" : normalizeCity(loc),
              mode: isOnline ? "Online" : "Offline",
              price: "Check site",
              registrationLink: link,
              imageUrl: item.image || "",
              uniqueId: uid,
            });
            added++;
          }
        } catch(_) {}
      });

      // HTML fallback
      if (added === 0) {
        $(".event-item, .event-card, [class*='event-item'], article.event, li.event").each((_, el) => {
          const titleEl = $(el).find("h2,h3,h4,[class*='title'],[class*='name']").first();
          const title   = titleEl.text().trim();
          if (!title || title.length < 5) return;
          const href  = $(el).find("a[href]").first().attr("href") || "";
          const link  = href.startsWith("http") ? href : `https://allevents.in${href}`;
          const uid   = `allevents-html-${title.toLowerCase().replace(/\W+/g,"-").slice(0,70)}`;
          if (seen.has(uid)) return;
          seen.add(uid);
          const dateText = $(el).find("time,[class*='date'],[class*='Date']").first().text().trim();
          const locText  = $(el).find("[class*='location'],[class*='venue']").first().text().trim();
          results.push({
            title,
            description: $(el).find("p,[class*='desc']").first().text().trim().slice(0,200) || `Tech event in ${city}`,
            eventType: _classify(title),
            platform: "AllEvents",
            date: dateText,
            location: normalizeCity(locText) || city,
            mode: (locText||"").toLowerCase().includes("online") ? "Online" : "Offline",
            price: "Check site",
            registrationLink: link,
            imageUrl: $(el).find("img").first().attr("src") || "",
            uniqueId: uid,
          });
          added++;
        });
      }

      logger.info(`[AllEvents] ${city} (${url.split("/").pop()}): +${added} events`);
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      logger.warn(`[AllEvents] ${url} failed: ${err.message}`);
    }
  }

  logger.info(`[AllEvents] Total: ${results.length} events`);
  return results;
}

function _classify(title) {
  const t = (title||"").toLowerCase();
  if (t.includes("expo") || t.includes("exhibition")) return "Conference";
  if (t.includes("conference") || t.includes("summit") || t.includes("conclave")) return "Conference";
  if (t.includes("workshop") || t.includes("bootcamp") || t.includes("training")) return "Workshop";
  if (t.includes("meetup") || t.includes("networking") || t.includes("mixer")) return "Meetup";
  if (t.includes("webinar") || t.includes("online") || t.includes("virtual")) return "Webinar";
  if (t.includes("ai") || t.includes("machine learning") || t.includes("data science")) return "AI/ML Event";
  if (t.includes("startup") || t.includes("entrepreneur") || t.includes("founder")) return "Startup Event";
  return "Meetup";
}

function normalizeCity(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  if (t.includes("bengaluru") || t.includes("bangalore")) return "Bengaluru";
  if (t.includes("mumbai")) return "Mumbai";
  if (t.includes("delhi")) return "New Delhi";
  if (t.includes("hyderabad")) return "Hyderabad";
  if (t.includes("pune")) return "Pune";
  if (t.includes("chennai")) return "Chennai";
  if (t.includes("kolkata")) return "Kolkata";
  if (t.includes("noida")) return "Noida";
  if (t.includes("gurugram") || t.includes("gurgaon")) return "Gurugram";
  if (t.includes("online") || t.includes("virtual")) return "Online";
  if (text.length < 30) return text.trim();
  return null;
}

module.exports = { scrapeAllEvents };
