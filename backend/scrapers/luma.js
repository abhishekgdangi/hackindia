/**
 * scrapers/luma.js — Lu.ma India tech events
 * Fixed: calendar API endpoint format changed. Now uses correct v1 API + discover.
 */
const axios  = require("axios");
const logger = require("../utils/logger");

const INDIA_RE = /india|bangalore|bengaluru|mumbai|delhi|hyderabad|pune|chennai|kolkata|noida|gurugram|gurgaon|kochi|jaipur|ahmedabad|indore/i;

async function scrapeLuma() {
  logger.info("[Luma] Starting scrape…");
  const results = [];
  const seen    = new Set();
  const now     = new Date();

  const headers = {
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 Chrome/125.0.0.0",
    "x-luma-client-type": "web",
  };

  // Strategy 1: Luma discover API with India location filter
  const discoverUrls = [
    "https://api.lu.ma/discover/get-paginated-events?location=India&period=future&limit=50",
    "https://api.lu.ma/discover/events?geo_latitude=20.5937&geo_longitude=78.9629&radius=3000&limit=50",
    "https://lu.ma/api/discover/get-paginated-events?location=India&period=future&pagination_limit=50",
  ];
  for (const url of discoverUrls) {
    try {
      const res     = await axios.get(url, { headers, timeout: 15000 });
      const entries = res.data?.entries || res.data?.events || (Array.isArray(res.data) ? res.data : []);
      if (entries.length > 0) {
        logger.info(`[Luma] Discover ${url} → ${entries.length}`);
        for (const entry of entries) {
          const ev = entry.event || entry;
          if (!ev?.name) continue;
          if (new Date(ev.start_at || ev.startAt || now) < now) continue;
          const locStr = [ev.geo_address_info?.city_state, ev.location, ev.city].filter(Boolean).join(" ");
          if (!INDIA_RE.test(locStr + " " + ev.name)) continue;
          const uid = ev.api_id || ev.id || ev.name;
          if (seen.has(uid)) continue;
          seen.add(uid);
          results.push(_parseEvent(ev));
        }
        if (results.length > 0) break;
      }
    } catch (err) {
      logger.warn(`[Luma] Discover ${url} failed: ${err.message}`);
    }
  }

  // Strategy 2: Known India community calendar slugs
  const calendarSlugs = [
    "bangaloretech", "mumbai-tech", "delhi-tech-community",
    "gdg-bangalore", "gdg-mumbai", "gdg-delhi",
    "india-tech", "technation-india",
  ];
  for (const slug of calendarSlugs) {
    const apiUrls = [
      `https://api.lu.ma/calendar/get-items?calendar_slug=${slug}&pagination_limit=20`,
      `https://api.lu.ma/public/v1/calendar/list-events?calendar_slug=${slug}&pagination_limit=20`,
    ];
    for (const url of apiUrls) {
      try {
        const res = await axios.get(url, { headers, timeout: 12000 });
        const entries = res.data?.entries || res.data?.events || [];
        for (const entry of entries) {
          const ev = entry.event || entry;
          if (!ev?.name) continue;
          if (new Date(ev.start_at || now) < now) continue;
          const uid = ev.api_id || ev.id || ev.name;
          if (seen.has(uid)) continue;
          seen.add(uid);
          results.push(_parseEvent(ev));
        }
        if (entries.length > 0) break;
      } catch (_) {}
    }
    await new Promise(r => setTimeout(r, 800));
  }

  logger.info(`[Luma] Total: ${results.length} events`);
  return results;
}

function _parseEvent(ev) {
  const city = ev.geo_address_info?.city_state || ev.location || ev.city || "India";
  const isOnline = /online|virtual|remote/i.test(city + " " + (ev.meeting_url || ""));
  const slug = ev.url || ev.slug || ev.api_id || "";
  const link = slug ? (slug.startsWith("http") ? slug : `https://lu.ma/${slug}`) : "https://lu.ma";
  return {
    title: ev.name,
    description: ev.description || ev.description_short || "",
    eventType: "Meetup",
    platform: "Luma",
    date: ev.start_at ? new Date(ev.start_at) : null,
    location: isOnline ? "Online" : city,
    price: ev.ticket_info?.is_free !== false ? "Free" : "Paid",
    registrationLink: link,
    imageUrl: ev.cover_url || ev.image || "",
    uniqueId: `luma-${(ev.api_id || ev.name || "").toLowerCase().replace(/\W+/g, "-").slice(0, 80)}`,
  };
}

module.exports = { scrapeLuma };
