/**
 * scrapers/luma.js
 * Lu.ma — India tech events via public calendar API
 * Sources: CommunityMeetups calendar + discover API filtered to India cities
 * No auth required for public calendar events.
 */
const axios  = require("axios");
const logger = require("../utils/logger");

const INDIA_CITIES = ["bangalore","bengaluru","mumbai","delhi","hyderabad",
  "pune","chennai","kolkata","noida","gurugram","gurgaon","kochi","jaipur",
  "ahmedabad","indore","india","online","virtual","remote"];

const INDIA_RE = new RegExp(INDIA_CITIES.join("|"), "i");

// Public India-focused Luma calendars (no auth needed)
const CALENDARS = [
  "CommunityMeetups",   // "all upcoming tech events across India"
  "devbangalore",       // Developer events Bangalore
  "GDGBangalore",       // Google Developers Bangalore
];

async function scrapeLuma() {
  logger.info("[Luma] Starting scrape…");
  const results = [];
  const seen    = new Set();
  const now     = new Date();

  for (const cal of CALENDARS) {
    try {
      // Luma public calendar list endpoint (no key needed for public calendars)
      const url = `https://api.lu.ma/public/v2/calendar/list-events?calendar_api_id=cal-${cal}&pagination_limit=50`;
      const res = await axios.get(url, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 HackIndia-Bot/1.0",
        },
        timeout: 15000,
      });

      const entries = res.data?.entries || [];
      logger.info(`[Luma] ${cal}: ${entries.length} raw events`);

      for (const entry of entries) {
        const ev = entry.event || entry;
        if (!ev?.name) continue;

        // Filter future events only
        const startAt = ev.start_at || ev.startAt;
        if (startAt && new Date(startAt) < now) continue;

        // Check India filter
        const locStr = [
          ev.geo_address_info?.city_state,
          ev.geo_address_info?.full_address,
          ev.location,
        ].filter(Boolean).join(" ");

        if (!INDIA_RE.test(locStr + " " + ev.name)) continue;

        const uid = `luma-${ev.api_id || ev.id || ev.name.toLowerCase().replace(/\W+/g,"-").slice(0,60)}`;
        if (seen.has(uid)) continue;
        seen.add(uid);

        const city = ev.geo_address_info?.city_state || locStr || "India";
        const isOnline = /online|virtual|remote/i.test(locStr + " " + ev.name);

        results.push({
          title:            ev.name.trim(),
          description:      ev.description?.slice(0, 300) || `Tech event in ${city}. Source: Luma.`,
          eventType:        _classify(ev.name),
          platform:         "Luma",
          date:             startAt ? new Date(startAt).toLocaleDateString("en-IN", {day:"numeric",month:"short",year:"numeric"}) : "",
          location:         isOnline ? "Online" : city,
          price:            ev.ticket_info?.is_free ? "Free" : ev.ticket_info?.price ? "Paid" : "Unknown",
          registrationLink: `https://lu.ma/${ev.url || ev.api_id || ""}`,
          imageUrl:         ev.cover_url || "",
          uniqueId:         uid,
        });
      }
    } catch (err) {
      // Try HTML fallback for this calendar
      logger.warn(`[Luma] API failed for ${cal}: ${err.message} — trying HTML`);
      const htmlResults = await _scrapeCalendarHTML(cal, now, seen);
      results.push(...htmlResults);
    }
  }

  // Also hit the discover API for India
  try {
    const discoverUrls = [
      "https://api.lu.ma/discover/search?query=tech+bangalore&pagination_limit=20",
      "https://api.lu.ma/discover/search?query=tech+mumbai&pagination_limit=20",
      "https://api.lu.ma/discover/search?query=developer+india&pagination_limit=20",
    ];
    for (const url of discoverUrls) {
      const res = await axios.get(url, {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 HackIndia-Bot/1.0" },
        timeout: 12000,
      });
      const events = res.data?.events || res.data?.entries || [];
      for (const ev of events) {
        if (!ev?.name) continue;
        const startAt = ev.start_at || ev.startAt;
        if (startAt && new Date(startAt) < now) continue;
        const uid = `luma-${ev.api_id||ev.id||ev.name.toLowerCase().replace(/\W+/g,"-").slice(0,60)}`;
        if (seen.has(uid)) continue;
        seen.add(uid);
        const city = ev.geo_address_info?.city_state || "India";
        results.push({
          title:            ev.name.trim(),
          description:      ev.description?.slice(0,300) || `Tech event in ${city}.`,
          eventType:        _classify(ev.name),
          platform:         "Luma",
          date:             startAt ? new Date(startAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}) : "",
          location:         /online|virtual/i.test(city) ? "Online" : city,
          price:            ev.ticket_info?.is_free ? "Free" : "Unknown",
          registrationLink: `https://lu.ma/${ev.url||ev.api_id||""}`,
          imageUrl:         ev.cover_url || "",
          uniqueId:         uid,
        });
      }
    }
  } catch(e) {
    logger.warn(`[Luma] Discover API failed: ${e.message}`);
  }

  logger.info(`[Luma] Total: ${results.length} events`);
  return results;
}

async function _scrapeCalendarHTML(cal, now, seen) {
  const results = [];
  try {
    const axios = require("axios");
    const cheerio = require("cheerio");
    const res = await axios.get(`https://lu.ma/${cal}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0", Accept: "text/html" },
      timeout: 15000,
    });
    const $ = cheerio.load(res.data);
    // Try __NEXT_DATA__
    const nd = $("script#__NEXT_DATA__").text();
    if (nd) {
      const data = JSON.parse(nd);
      const events = data?.props?.pageProps?.calendar?.events ||
                     data?.props?.pageProps?.events || [];
      for (const ev of events) {
        if (!ev?.name) continue;
        const startAt = ev.start_at || ev.startAt;
        if (startAt && new Date(startAt) < now) continue;
        const uid = `luma-${ev.api_id||ev.id||ev.name.toLowerCase().replace(/\W+/g,"-").slice(0,60)}`;
        if (seen.has(uid)) continue;
        seen.add(uid);
        results.push({
          title: ev.name.trim(),
          description: ev.description?.slice(0,300) || "Tech event in India.",
          eventType: _classify(ev.name),
          platform: "Luma",
          date: startAt ? new Date(startAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}) : "",
          location: ev.geo_address_info?.city_state || "India",
          price: ev.ticket_info?.is_free ? "Free" : "Unknown",
          registrationLink: `https://lu.ma/${ev.url||ev.api_id||""}`,
          imageUrl: ev.cover_url || "",
          uniqueId: uid,
        });
      }
    }
  } catch(e) {
    logger.warn(`[Luma] HTML fallback failed for ${cal}: ${e.message}`);
  }
  return results;
}

function _classify(title = "") {
  const t = title.toLowerCase();
  if (/summit|conference|congress|conf\b/i.test(t))  return "Conference";
  if (/workshop|training|bootcamp/i.test(t))          return "Workshop";
  if (/meetup|meet-up|gathering/i.test(t))            return "Meetup";
  if (/webinar|virtual\s+talk/i.test(t))              return "Webinar";
  if (/hackathon|hack\b/i.test(t))                    return "Hackathon";
  if (/\bai\b|llm|ml\b|machine learning|data/i.test(t)) return "AI/ML Event";
  if (/startup|founder|venture|pitch/i.test(t))       return "Startup Event";
  if (/devfest|gdg|google/i.test(t))                  return "Conference";
  return "Meetup";
}

module.exports = { scrapeLuma };
