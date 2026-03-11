/**
 * scrapers/eventbriteScraper.js
 * Eventbrite — India tech events with proper direct event URLs
 */

const axios   = require("axios");
const cheerio = require("cheerio");
const logger  = require("../utils/logger");

async function scrapeEventbrite() {
  logger.info("[Eventbrite] Starting scrape…");
  const results = [];

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,*/*;q=0.9",
    "Accept-Language": "en-IN,en;q=0.9",
  };

  // India-specific tech event URLs only
  const URLS = [
    // India offline tech events
    "https://www.eventbrite.com/d/india/technology/",
    "https://www.eventbrite.com/d/india/free--science-and-tech--events/",
    "https://www.eventbrite.com/d/india/tech--conferences/",
    "https://www.eventbrite.com/d/india/science-and-tech--expos/",
    "https://www.eventbrite.com/d/india/science-and-tech--exhibitions/",
    // City-specific — catches events missed by country-level
    "https://www.eventbrite.com/d/india--bangalore/technology/",
    "https://www.eventbrite.com/d/india--mumbai/technology/",
    "https://www.eventbrite.com/d/india--delhi/technology/",
    "https://www.eventbrite.com/d/india--hyderabad/technology/",
    "https://www.eventbrite.com/d/india--pune/technology/",
    // Online India tech events
    "https://www.eventbrite.com/d/online/tech--expos--india/",
    "https://www.eventbrite.com/d/online/india--technology/",
    // AI/ML specific
    "https://www.eventbrite.com/d/india/artificial-intelligence/",
    "https://www.eventbrite.com/d/india--bangalore/artificial-intelligence/",
  ];

  for (const url of URLS) {
    try {
      const res = await axios.get(url, { headers, timeout: 25000 });
      const $   = cheerio.load(res.data);

      // Primary: extract from __NEXT_DATA__ JSON
      const nd = $("script#__NEXT_DATA__").html();
      if (nd) {
        try {
          const json  = JSON.parse(nd);
          // Try multiple paths Eventbrite uses
          const events =
            json?.props?.pageProps?.serverPayload?.search_result?.events?.results ||
            json?.props?.pageProps?.serverPayload?.events?.results ||
            json?.props?.pageProps?.events ||
            json?.props?.pageProps?.initialData?.search_result?.events?.results ||
            [];

          for (const evt of events) {
            const title = (evt.name || evt.title || "").trim();
            if (!title) continue;

            // Must have a real event URL, not homepage
            const evtUrl = evt.url || evt.event_url || "";
            if (!evtUrl || !evtUrl.includes("/e/")) continue;

            // India-only filter: skip events not in India
            const venueCountry = (evt.venue?.country || evt.primary_venue?.address?.country || "").toLowerCase();
            const isOnlineEvent = !!evt.online_event;
            if (!isOnlineEvent && venueCountry && venueCountry !== "in" && venueCountry !== "india") continue;

            const city = isOnlineEvent ? "Online"
              : (evt.venue?.city || evt.primary_venue?.address?.city || "India");

            const uid = `eventbrite-${evt.id || title.toLowerCase().replace(/\W+/g,"-").slice(0,60)}`;
            results.push({
              title,
              description: (evt.summary || evt.description || "").slice(0, 300),
              eventType: _classifyEvent(title),
              platform: "Eventbrite",
              date: evt.start?.local
                ? new Date(evt.start.local).toLocaleDateString("en-IN", {day:"2-digit",month:"short",year:"numeric"})
                : (evt.start_date || ""),
              location: city,
              mode: isOnlineEvent ? "Online" : "Offline",
              price: (evt.is_free === false && evt.ticket_availability?.is_free === false) ? "Paid" : "Free",
              registrationLink: evtUrl,
              imageUrl: evt.logo?.url || evt.image?.url || evt.logo?.original?.url || "",
              uniqueId: uid,
            });
          }
          logger.info(`[Eventbrite] __NEXT_DATA__ from ${url}: ${events.length} raw → ${results.length} so far`);
          if (events.length > 0) { await new Promise(r => setTimeout(r, 2000)); continue; }
        } catch (_) {}
      }

      // Fallback: parse HTML cards directly
      const cards = $("a[href*='/e/']");
      cards.each((_, el) => {
        const href = $(el).attr("href") || "";
        if (!href.includes("/e/") || href.includes("eventbrite.com/e/") === false) return;
        const link = href.startsWith("http") ? href.split("?")[0] : `https://www.eventbrite.com${href.split("?")[0]}`;

        const title = $(el).find("h2, h3, [class*='title'], [class*='Typography']").first().text().trim()
          || $(el).attr("aria-label") || "";
        if (!title || title.length < 5) return;

        // Try multiple date selectors
        const dateEl = $(el).find("time, [class*='date'], [class*='Date'], [class*='event-date'], p").filter((_, e) => {
          const t = $(e).text().trim();
          return t && (t.match(/\d{1,2}\s+[A-Za-z]+/) || t.match(/[A-Za-z]+\s+\d{1,2}/) || t.match(/\d{4}/));
        }).first();
        const dateText = dateEl.attr("datetime") 
          ? new Date(dateEl.attr("datetime")).toLocaleDateString("en-IN", {day:"2-digit",month:"short",year:"numeric"})
          : dateEl.text().trim();
        const locText  = $(el).find("[class*='location'], [class*='Location'], [class*='venue']").first().text().trim();
        const cardText = $(el).text().toLowerCase();
        // Default to Free unless explicitly shows paid/ticket price
        const isFree = !cardText.includes("paid") && !cardText.match(/₹\s*\d+/) && !cardText.match(/\$\s*\d+/) && !cardText.includes("register for");

        const uid = `eventbrite-html-${link.split("/e/")[1]?.split("/")[0] || title.toLowerCase().replace(/\W+/g,"-").slice(0,60)}`;
        if (results.some(r => r.uniqueId === uid)) return;

        results.push({
          title,
          description: $(el).find("p, [class*='summary']").first().text().trim().slice(0, 200),
          eventType: _classifyEvent(title),
          platform: "Eventbrite",
          date: dateText,
          location: locText || "India",
          mode: (locText||"").toLowerCase().includes("online") ? "Online" : "Offline",
          price: isFree ? "Free" : "Paid",
          registrationLink: link,
          imageUrl: $(el).find("img").first().attr("src") || "",
          uniqueId: uid,
        });
      });

      logger.info(`[Eventbrite] ${url}: ${results.length} total so far`);
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      logger.warn(`[Eventbrite] ${url} failed: ${err.message}`);
    }
  }

  logger.info(`[Eventbrite] Total: ${results.length} events`);

  // Deduplicate
  const seen = new Set();
  return results.filter(e => {
    if (seen.has(e.uniqueId)) return false;
    seen.add(e.uniqueId);
    return true;
  });
}

function _classifyEvent(title) {
  const t = (title || "").toLowerCase();
  if (t.includes("expo") || t.includes("exhibition") || t.includes("trade show") || t.includes("fair")) return "Conference";
  if (t.includes("conference") || t.includes("summit") || t.includes("conclave")) return "Conference";
  if (t.includes("workshop") || t.includes("training") || t.includes("bootcamp")) return "Workshop";
  if (t.includes("meetup") || t.includes("networking") || t.includes("meet")) return "Meetup";
  if (t.includes("webinar") || t.includes("online session") || t.includes("virtual")) return "Webinar";
  if (t.includes("hackathon")) return "Hackathon";
  if (t.includes("ai") || t.includes("machine learning") || t.includes("ml ")) return "AI/ML Event";
  return "Conference";
}

module.exports = { scrapeEventbrite };
