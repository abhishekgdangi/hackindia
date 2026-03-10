/**
 * scrapers/meetupScraper.js
 * Meetup.com — public tech events via their open graph / RSS feed
 * Note: meetup.com blocks most scraping; we use their public JSON feed.
 */

const axios   = require("axios");
const cheerio = require("cheerio");
const logger  = require("../utils/logger");

async function scrapeMeetup() {
  logger.info("[Meetup] Starting scrape…");
  const results = [];

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
    Accept: "application/json, text/html, */*",
    "Accept-Language": "en-IN,en;q=0.9",
  };

  // Approach 1: Meetup GraphQL-lite public endpoint (no auth required for public events)
  const QUERIES = [
    { lat: 12.9716, lon: 77.5946, radius: 100, keyword: "tech", city: "Bangalore" },
    { lat: 28.6139, lon: 77.2090, radius: 100, keyword: "developer", city: "Delhi" },
    { lat: 19.0760, lon: 72.8777, radius: 100, keyword: "tech", city: "Mumbai" },
  ];

  for (const q of QUERIES) {
    try {
      const apiUrl = `https://api.meetup.com/find/upcoming_events?key=&sign=true&photo-host=public&lon=${q.lon}&lat=${q.lat}&radius=${q.radius}&text=${encodeURIComponent(q.keyword)}&page=20`;

      const res = await axios.get(apiUrl, { headers, timeout: 15000 });
      const events = res.data?.events || [];

      for (const evt of events) {
        const title = (evt.name || "").trim();
        if (!title) continue;

        const loc =
          evt.venue?.city ||
          evt.venue?.localized_location ||
          (evt.is_online_event ? "Online" : q.city);

        const uid = `meetup-${evt.id || (title+"-"+(evt.local_date||evt.time||"")).toString().toLowerCase().replace(/\W+/g, "-").slice(0, 80)}`;

        results.push({
          title,
          description: (evt.description || "").replace(/<[^>]*>/g, "").slice(0, 350),
          eventType:   "Meetup",
          platform:    "Meetup",
          date:        evt.local_date || evt.time
            ? new Date(evt.time || evt.local_date).toLocaleDateString("en-IN")
            : "",
          location: loc,
          price:    evt.fee ? "Paid" : "Free",
          registrationLink: evt.link || `https://www.meetup.com`,
          imageUrl: evt.group?.group_photo?.photo_link || "",
          uniqueId: uid,
        });
      }
      logger.info(`[Meetup] ${q.city}: ${events.length} events`);

      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      // Meetup API often 401s without key — fallback to HTML
      logger.warn(`[Meetup] API failed for ${q.city}: ${err.message}`);
    }
  }

  // Approach 2: Parse meetup.com/find HTML if API gave nothing
  if (results.length === 0) {
    try {
      const res = await axios.get(
        "https://www.meetup.com/find/?keywords=tech&source=EVENTS&distance=tenMiles",
        { headers, timeout: 25000 }
      );
      const $ = cheerio.load(res.data);

      // Meetup renders via React; look for __NEXT_DATA__ or static content
      const scriptTag = $("script#__NEXT_DATA__").html() ||
        $("script[type='application/json']").first().html();

      if (scriptTag) {
        try {
          const json   = JSON.parse(scriptTag);
          const events =
            json?.props?.pageProps?.events ||
            json?.props?.pageProps?.searchResult?.edges ||
            [];

          const evtList = Array.isArray(events)
            ? events.map(e => e.node || e).filter(Boolean)
            : [];

          for (const evt of evtList) {
            const title = (evt.title || evt.name || "").trim();
            if (!title) continue;
            const uid = `meetup-nx-${(evt.id || (title+"-"+(evt.dateTime||""))).toLowerCase().replace(/\W+/g, "-").slice(0, 80)}`;
            results.push({
              title,
              description: (evt.description || "").slice(0, 300),
              eventType:   "Meetup",
              platform:    "Meetup",
              date:        evt.dateTime
                ? new Date(evt.dateTime).toLocaleDateString("en-IN")
                : "",
              location: evt.venue?.city || "Online",
              price:    "Free",
              registrationLink: `https://www.meetup.com/events/${evt.id || ""}`,
              imageUrl: evt.imageUrl || "",
              uniqueId: uid,
            });
          }
        } catch (_) {}
      }
      logger.info(`[Meetup] HTML fallback: ${results.length} events`);
    } catch (htmlErr) {
      logger.error(`[Meetup] HTML fallback failed: ${htmlErr.message}`);
    }
  }

  const seen = new Set();
  return results.filter(e => {
    if (seen.has(e.uniqueId)) return false;
    seen.add(e.uniqueId);
    return true;
  });
}

module.exports = { scrapeMeetup };
