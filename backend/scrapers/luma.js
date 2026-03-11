/**
 * scrapers/luma.js — Lu.ma India tech events
 * Fixed: calendar API endpoint format changed. Now uses correct v1 API + discover.
 */
const axios  = require("axios");
const logger = require("../utils/logger");

const INDIA_RE = /india|bangalore|bengaluru|mumbai|delhi|hyderabad|pune|chennai|kolkata|noida|gurugram|gurgaon|kochi|jaipur|ahmedabad|indore/i;


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

  // Strategy 1: Cursor-based pagination through India events
  const cityQueries = ["India", "Bengaluru", "Mumbai", "Hyderabad", "Pune", "Chennai", "Delhi"];
  for (const city of cityQueries) {
    let cursor = null;
    let page = 0;
    while (page < 4) {
      try {
        const baseUrl = `https://api.lu.ma/discover/get-paginated-events?location=${encodeURIComponent(city)}&period=future&limit=50`;
        const url = cursor ? `${baseUrl}&pagination_cursor=${encodeURIComponent(cursor)}` : baseUrl;
        const res = await axios.get(url, { headers, timeout: 15000 });
        const entries = res.data?.entries || [];
        if (!entries.length) break;
        logger.info(`[Luma] Discover ${city} page ${page+1} → ${entries.length}`);
        let added = 0;
        for (const entry of entries) {
          const ev = entry.event || entry;
          if (!ev?.name) continue;
          if (new Date(ev.start_at || now) < now) continue;
          const uid = ev.api_id || ev.id || ev.name;
          if (seen.has(uid)) continue;
          seen.add(uid);
          results.push(_parseEvent(ev));
          added++;
        }
        cursor = res.data?.next_cursor || res.data?.pagination?.next_cursor || null;
        if (!cursor || added === 0) break;
        page++;
        await new Promise(r => setTimeout(r, 800));
      } catch (err) {
        logger.warn(`[Luma] Discover ${city} page ${page+1} failed: ${err.message}`);
        break;
      }
    }
  }

  // Strategy 2: Known India community calendar slugs
  const calendarSlugs = [
    "bangaloretech", "mumbai-tech", "delhi-tech-community",
    "gdg-bangalore", "gdg-mumbai", "gdg-delhi",
    "india-tech", "technation-india",
    "bangalore-ai", "mumbai-startup", "hyderabad-tech",
    "chennai-tech", "pune-tech", "india-founders",
    "bengaluru-tech", "ai-india", "devs-india",
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
  const rawCity = ev.geo_address_info?.city || ev.geo_address_info?.city_state || ev.location || ev.city || "";
  const city = normalizeCity(rawCity) || "India";
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
