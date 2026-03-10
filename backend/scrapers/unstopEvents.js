/**
 * scrapers/unstopEvents.js
 * Unstop — India's biggest student opportunity platform
 * Scrapes workshops, conferences, and events (not hackathons)
 * Uses their internal search API + HTML fallback
 */
const axios   = require("axios");
const cheerio = require("cheerio");
const logger  = require("../utils/logger");

async function scrapeUnstopEvents() {
  logger.info("[UnstopEvents] Starting scrape…");
  const results = [];
  const seen    = new Set();
  const now     = new Date();

  // Strategy 1: Internal search API
  const endpoints = [
    "https://unstop.com/api/public/opportunity/search?type=event&status=open&size=30&start=0",
    "https://unstop.com/api/public/opportunity/search?type=workshop&status=open&size=30&start=0",
    "https://unstop.com/api/public/opportunity/search?type=conference&status=open&size=30&start=0",
  ];

  for (const url of endpoints) {
    try {
      const res = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
          Accept: "application/json",
          Referer: "https://unstop.com/events",
        },
        timeout: 15000,
      });
      const items = res.data?.data?.data || res.data?.data || res.data?.items || [];
      logger.info(`[UnstopEvents] ${url.split("type=")[1].split("&")[0]}: ${items.length} items`);
      for (const item of items) {
        const h = _parseItem(item, now, seen);
        if (h) results.push(h);
      }
    } catch (err) {
      logger.warn(`[UnstopEvents] API failed: ${err.message}`);
    }
  }

  // Strategy 2: HTML __NEXT_DATA__ fallback
  if (results.length === 0) {
    const pages = [
      "https://unstop.com/events",
      "https://unstop.com/workshops",
      "https://unstop.com/conferences",
    ];
    for (const pageUrl of pages) {
      try {
        const res = await axios.get(pageUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0",
            Accept: "text/html",
          },
          timeout: 15000,
        });
        const $ = cheerio.load(res.data);
        const nd = $("script#__NEXT_DATA__").text();
        if (nd) {
          const data = JSON.parse(nd);
          const items = data?.props?.pageProps?.opportunities?.data ||
                        data?.props?.pageProps?.data?.data || [];
          for (const item of items) {
            const h = _parseItem(item, now, seen);
            if (h) results.push(h);
          }
        }
        // Also try HTML card scraping
        $(".opportunity-card, [class*='card'], .competition-card").each((_, el) => {
          try {
            const title = $(el).find("h2,h3,.title,.name").first().text().trim();
            const link  = $(el).find("a").first().attr("href") || "";
            if (!title || !link) return;
            const fullLink = link.startsWith("http") ? link : `https://unstop.com${link}`;
            const uid = `unstop-ev-${title.toLowerCase().replace(/\W+/g,"-").slice(0,60)}`;
            if (seen.has(uid)) return;
            seen.add(uid);
            const date = $(el).find(".date,[class*='date']").first().text().trim();
            const loc  = $(el).find(".location,[class*='location']").first().text().trim();
            results.push({
              title, description: `Tech event on Unstop. ${date}`,
              eventType: _classify(title), platform: "Unstop",
              date, location: loc || "India",
              price: "Unknown", registrationLink: fullLink, imageUrl: "", uniqueId: uid,
            });
          } catch(_) {}
        });
      } catch (err) {
        logger.warn(`[UnstopEvents] HTML failed for ${pageUrl}: ${err.message}`);
      }
    }
  }

  logger.info(`[UnstopEvents] Total: ${results.length} events`);
  return results;
}

function _parseItem(item, now, seen) {
  if (!item) return null;
  const title = item.title || item.name || "";
  if (!title) return null;

  // Skip if deadline passed
  const deadline = item.end_date || item.deadline || item.registrations_end_on;
  if (deadline && new Date(deadline) < now) return null;

  const slug = item.slug || item.id || title.toLowerCase().replace(/\W+/g,"-").slice(0,60);
  const uid  = `unstop-ev-${slug}`;
  if (seen.has(uid)) return null;
  seen.add(uid);

  const link = item.url || item.slug
    ? `https://unstop.com/${item.opportunity_type||"event"}/${item.slug||item.id}`
    : "https://unstop.com/events";

  const startDate = item.start_date || item.event_date || deadline;
  const dateStr   = startDate
    ? new Date(startDate).toLocaleDateString("en-IN", {day:"numeric",month:"short",year:"numeric"})
    : "";

  const city = item.city || item.location || "India";
  return {
    title:            title.trim(),
    description:      item.description?.slice(0,300) || item.short_description?.slice(0,300) || `${_classify(title)} on Unstop.`,
    eventType:        _classify(title),
    platform:         "Unstop",
    date:             dateStr,
    location:         /online|virtual|remote/i.test(city) ? "Online" : city,
    price:            item.is_paid ? "Paid" : "Free",
    registrationLink: link,
    imageUrl:         item.banner_image || item.image || "",
    uniqueId:         uid,
  };
}

function _classify(title = "") {
  const t = title.toLowerCase();
  if (/summit|conference|congress|conf\b/i.test(t))     return "Conference";
  if (/workshop|training|bootcamp/i.test(t))             return "Workshop";
  if (/meetup|meet-up/i.test(t))                         return "Meetup";
  if (/webinar/i.test(t))                                return "Webinar";
  if (/hackathon|hack\b/i.test(t))                       return "Hackathon";
  if (/\bai\b|llm|ml\b|data science|machine/i.test(t))  return "AI/ML Event";
  if (/startup|pitch|founder/i.test(t))                  return "Startup Event";
  return "Workshop";
}

module.exports = { scrapeUnstopEvents };
