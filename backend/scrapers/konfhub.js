/**
 * scrapers/konfhub.js
 * KonfHub — India's leading tech event platform
 * Uses their internal search API (reverse engineered from network calls)
 */
const axios   = require("axios");
const cheerio = require("cheerio");
const logger  = require("../utils/logger");

async function scrapeKonfhub() {
  logger.info("[KonfHub] Starting scrape…");
  const results = [];
  const seen    = new Set();
  const now     = new Date();

  // Strategy 1: KonfHub internal API (from network inspection)
  const apiUrls = [
    "https://api.konfhub.com/event?type=upcoming&size=30&from=0",
    "https://api.konfhub.com/event/list?status=upcoming&limit=30",
    "https://konfhub.com/api/events?status=upcoming&page=1&limit=30",
  ];

  for (const url of apiUrls) {
    try {
      const res = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36",
          Accept: "application/json",
          Origin: "https://konfhub.com",
          Referer: "https://konfhub.com/events",
        },
        timeout: 12000,
      });
      const items = res.data?.data || res.data?.events || res.data?.items || res.data || [];
      if (Array.isArray(items) && items.length > 0) {
        logger.info(`[KonfHub] API ${url}: ${items.length} items`);
        for (const item of items) {
          const h = _parseItem(item, now, seen);
          if (h) results.push(h);
        }
        break; // one working API is enough
      }
    } catch (err) {
      logger.warn(`[KonfHub] API failed: ${err.message}`);
    }
  }

  // Strategy 2: HTML scraping with cheerio
  if (results.length === 0) {
    try {
      const res = await axios.get("https://konfhub.com/events", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        timeout: 20000,
      });
      const $ = cheerio.load(res.data);

      // Try __NEXT_DATA__ or similar embedded JSON
      const scripts = $("script").map((_, el) => $(el).html()).get();
      for (const sc of scripts) {
        if (sc && sc.includes('"events"') && sc.includes('"title"')) {
          try {
            const match = sc.match(/\{.*"events".*\}/s);
            if (match) {
              const data = JSON.parse(match[0]);
              const events = data.events || [];
              logger.info(`[KonfHub] Found ${events.length} events in page script`);
              for (const ev of events) {
                const h = _parseItem(ev, now, seen);
                if (h) results.push(h);
              }
            }
          } catch (_) {}
        }
      }

      // Fallback: scrape event cards directly
      $("[class*='event-card'], [class*='EventCard'], .event-tile, article").each((_, el) => {
        try {
          const title = $(el).find("h2,h3,h4,[class*='title'],[class*='name']").first().text().trim();
          if (!title || title.length < 5) return;
          const link  = $(el).find("a").first().attr("href") || "";
          const fullLink = link.startsWith("http") ? link : link ? `https://konfhub.com${link}` : "https://konfhub.com/events";
          const date  = $(el).find("[class*='date'],[class*='time']").first().text().trim();
          const loc   = $(el).find("[class*='location'],[class*='venue']").first().text().trim();
          const uid   = `konfhub-${title.toLowerCase().replace(/\W+/g,"-").slice(0,60)}`;
          if (seen.has(uid)) return;
          seen.add(uid);
          results.push({
            title, description: `Tech event on KonfHub. ${date}`,
            eventType: _classify(title), platform: "KonfHub",
            date, location: loc || "India",
            price: "Unknown", registrationLink: fullLink, imageUrl: "", uniqueId: uid,
          });
        } catch(_) {}
      });
    } catch (err) {
      logger.warn(`[KonfHub] HTML scrape failed: ${err.message}`);
    }
  }

  logger.info(`[KonfHub] Total: ${results.length} events`);
  return results;
}

function _parseItem(item, now, seen) {
  if (!item) return null;
  const title = item.title || item.name || item.event_name || "";
  if (!title || title.length < 4) return null;

  const endDate = item.end_date || item.end_time || item.registrations_end;
  if (endDate && new Date(endDate) < now) return null;

  const slug = item.slug || item.event_id || item.id || title.toLowerCase().replace(/\W+/g,"-").slice(0,60);
  const uid  = `konfhub-${slug}`;
  if (seen.has(uid)) return null;
  seen.add(uid);

  const startDate = item.start_date || item.start_time || item.event_date;
  const dateStr   = startDate
    ? new Date(startDate).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})
    : "";

  const city = item.city || item.location || item.venue_city || "India";
  const link = item.url || (item.slug ? `https://konfhub.com/${item.slug}` : "https://konfhub.com/events");

  return {
    title:            title.trim(),
    description:      (item.description||item.short_desc||"").slice(0,300) || `${_classify(title)} on KonfHub.`,
    eventType:        _classify(title),
    platform:         "KonfHub",
    date:             dateStr,
    location:         /online|virtual|remote/i.test(city) ? "Online" : city,
    price:            item.is_paid===false || item.price===0 ? "Free" : item.is_paid ? "Paid" : "Unknown",
    registrationLink: link,
    imageUrl:         item.banner || item.image_url || item.thumbnail || "",
    uniqueId:         uid,
  };
}

function _classify(title = "") {
  const t = title.toLowerCase();
  if (/summit|conference|devfest|conf\b/i.test(t))      return "Conference";
  if (/workshop|training|bootcamp/i.test(t))             return "Workshop";
  if (/meetup|meet-up|usergroup/i.test(t))               return "Meetup";
  if (/webinar/i.test(t))                                return "Webinar";
  if (/hackathon/i.test(t))                              return "Hackathon";
  if (/\bai\b|llm|ml\b|data|machine/i.test(t))          return "AI/ML Event";
  if (/startup|pitch/i.test(t))                          return "Startup Event";
  return "Conference";
}

module.exports = { scrapeKonfhub };
