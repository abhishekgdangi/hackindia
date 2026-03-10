/**
 * scrapers/gdgCommunity.js
 * GDG Community (gdg.community.dev) — India DevFests, GDG meetups
 * Uses their public REST API — no auth needed for public events
 */
const axios   = require("axios");
const cheerio = require("cheerio");
const logger  = require("../utils/logger");

async function scrapeGDGCommunity() {
  logger.info("[GDGCommunity] Starting scrape…");
  const results = [];
  const seen    = new Set();
  const now     = new Date();

  // Strategy 1: Public API with India filter
  const apiUrls = [
    "https://gdg.community.dev/api/event/?fields=id,name,start_date,end_date,chapter__city,chapter__country,event_type_title,url,description&chapter__country=IN&status=Confirmed&format=json&limit=50&ordering=start_date",
    "https://gdg.community.dev/api/event/?chapter__country=IN&format=json&limit=50",
  ];

  for (const url of apiUrls) {
    try {
      const res = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 Chrome/125.0.0.0",
          Accept: "application/json",
        },
        timeout: 15000,
      });
      const items = res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []);
      if (items.length > 0) {
        logger.info(`[GDGCommunity] API: ${items.length} events`);
        for (const item of items) {
          const h = _parse(item, now, seen);
          if (h) results.push(h);
        }
        break;
      }
    } catch (err) {
      logger.warn(`[GDGCommunity] API failed: ${err.message}`);
    }
  }

  // Strategy 2: HTML scrape of events page filtered to India
  if (results.length === 0) {
    try {
      const res = await axios.get("https://gdg.community.dev/events/?country=IN", {
        headers: { "User-Agent": "Mozilla/5.0 Chrome/125.0.0.0", Accept: "text/html" },
        timeout: 20000,
      });
      const $ = cheerio.load(res.data);

      // Try __NEXT_DATA__
      const nd = $("script#__NEXT_DATA__").text();
      if (nd) {
        const data = JSON.parse(nd);
        const events = data?.props?.pageProps?.events || data?.props?.pageProps?.upcomingEvents || [];
        for (const ev of events) {
          const h = _parse(ev, now, seen);
          if (h) results.push(h);
        }
      }

      // Try inline script data
      $("script:not([src])").each((_, el) => {
        const txt = $(el).html() || "";
        if (txt.includes("chapter__country") || txt.includes("IN") && txt.includes("event")) {
          try {
            const m = txt.match(/window\.__INITIAL_STATE__\s*=\s*(\{.*?\});/s);
            if (m) {
              const d = JSON.parse(m[1]);
              const evs = d?.events?.list || [];
              evs.forEach(ev => { const h = _parse(ev, now, seen); if(h) results.push(h); });
            }
          } catch(_) {}
        }
      });
    } catch (err) {
      logger.warn(`[GDGCommunity] HTML failed: ${err.message}`);
    }
  }

  logger.info(`[GDGCommunity] Total: ${results.length} events`);
  return results;
}

function _parse(item, now, seen) {
  if (!item) return null;
  const title = (item.name || item.title || "").trim();
  if (!title) return null;

  const startDate = item.start_date || item.startDate || item.start_at;
  if (startDate && new Date(startDate) < now) return null;

  const city    = item.chapter__city || item.city || item.location || "";
  const country = item.chapter__country || item.country || "";
  const INDIA_RE = /(india|bangalore|bengaluru|mumbai|delhi|pune|hyderabad|chennai|kolkata|noida|gurugram|gurgaon|kochi|ahmedabad|jaipur|indore|chandigarh|lucknow|surat)/i;
  // Strict India-only: must have IN country code OR known India city name
  const isIndia = country === "IN" || INDIA_RE.test(city) || INDIA_RE.test(item.chapter__name || "");
  if (!isIndia) return null;
  const cityDisplay = city || "India";

  const slug  = item.url || String(item.id || title.toLowerCase().replace(/\W+/g,"-").slice(0,60));
  const uid   = `gdgcommunity-${slug.replace(/\W+/g,"-").slice(0,80)}`;
  if (seen.has(uid)) return null;
  seen.add(uid);

  const link  = slug.startsWith("http") ? slug : `https://gdg.community.dev/events/details/${slug}/`;
  const dateStr = startDate ? new Date(startDate).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}) : "";

  return {
    title,
    description: (item.description || item.summary || "").slice(0,300) || `GDG event in ${cityDisplay}. DevFest, workshops & more.`,
    eventType:   _classify(title),
    platform:    "GDG Community",
    date:        dateStr,
    location:    /online|virtual/i.test(cityDisplay) ? "Online" : cityDisplay,
    mode:        /online|virtual/i.test(cityDisplay) ? "Online" : "Offline",
    price:       "Free",
    registrationLink: link,
    imageUrl:    item.image || item.cover_url || "",
    uniqueId:    uid,
  };
}

function _classify(t = "") {
  if (/devfest/i.test(t))                         return "Conference";
  if (/workshop|codelab|study jam/i.test(t))       return "Workshop";
  if (/hackathon|hack\b/i.test(t))                 return "Hackathon";
  if (/\bai\b|llm|cloud|ml\b|gemini/i.test(t))    return "AI/ML Event";
  if (/meetup|talk|session/i.test(t))              return "Meetup";
  return "Meetup";
}

module.exports = { scrapeGDGCommunity };
