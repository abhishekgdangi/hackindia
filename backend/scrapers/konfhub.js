/**
 * scrapers/konfhub.js — KonfHub India conferences/events
 * Fixed: Auth-required APIs blocked. Now uses HTML scraping of public listing pages.
 */
const axios   = require("axios");
const cheerio = require("cheerio");
const logger  = require("../utils/logger");

async function scrapeKonfhub() {
  logger.info("[KonfHub] Starting scrape…");
  const results = [];
  const seen    = new Set();
  const now     = new Date();

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9",
    Referer: "https://konfhub.com",
  };

  const urls = [
    "https://konfhub.com/explore",
    "https://konfhub.com/events",
    "https://konfhub.com/conferences",
  ];

  for (const url of urls) {
    try {
      const res = await axios.get(url, { headers, timeout: 25000 });
      const $   = cheerio.load(res.data);

      // Try JSON-LD structured data
      $("script[type='application/ld+json']").each((_, el) => {
        try {
          const data = JSON.parse($(el).html());
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
            if (!["Event", "Conference", "Hackathon"].includes(item["@type"])) continue;
            const name = item.name || "";
            if (!name || seen.has(name)) continue;
            const startDate = item.startDate ? new Date(item.startDate) : null;
            if (startDate && startDate < now) continue;
            const link = item.url || item["@id"] || "";
            seen.add(name);
            results.push({
              title: name,
              description: item.description || "",
              eventType: "Conference",
              platform: "KonfHub",
              date: startDate,
              location: item.location?.name || item.location?.address?.addressLocality || "India",
              price: "Unknown",
              registrationLink: link,
              imageUrl: item.image?.[0] || item.image || "",
              uniqueId: `konfhub-${name.toLowerCase().replace(/\W+/g, "-").slice(0, 80)}`,
            });
          }
        } catch (_) {}
      });

      // Check __NEXT_DATA__
      const nd = $("script#__NEXT_DATA__").html();
      if (nd) {
        try {
          const json  = JSON.parse(nd);
          const page  = json?.props?.pageProps;
          const items = page?.events || page?.conferences || page?.data?.events || [];
          for (const item of items) {
            const name = item.name || item.title || "";
            if (!name || seen.has(name)) continue;
            const startDate = item.start_date ? new Date(item.start_date) : null;
            if (startDate && startDate < now) continue;
            const slug = item.slug || item.id || "";
            const link = slug ? `https://konfhub.com/${slug}` : "";
            seen.add(name);
            results.push({
              title: name, description: item.description || "",
              eventType: "Conference", platform: "KonfHub",
              date: startDate, location: item.city || item.location || "India",
              price: item.is_free ? "Free" : item.ticket_price ? "Paid" : "Unknown",
              registrationLink: link, imageUrl: item.banner_image || item.image || "",
              uniqueId: `konfhub-${(slug || name).toLowerCase().replace(/\W+/g, "-").slice(0, 80)}`,
            });
          }
        } catch (_) {}
      }

      // Card scraping fallback
      const cards = $("[class*='event'], [class*='conference'], [class*='card'], article").toArray();
      for (const el of cards) {
        const $el  = $(el);
        const name = $el.find("h2,h3,h4,[class*='title'],[class*='name']").first().text().trim();
        if (!name || name.length < 3 || seen.has(name)) continue;
        const href = $el.find("a[href]").first().attr("href") || "";
        const link = href.startsWith("http") ? href : href ? `https://konfhub.com${href}` : "";
        if (!link || link === "https://konfhub.com") continue;
        const dateText = $el.find("[class*='date'],time").first().text().trim();
        const startDate = dateText ? new Date(dateText) : null;
        if (startDate && !isNaN(startDate) && startDate < now) continue;
        seen.add(name);
        results.push({
          title: name, description: $el.find("p,[class*='desc']").first().text().trim() || "",
          eventType: "Conference", platform: "KonfHub",
          date: startDate && !isNaN(startDate) ? startDate : null,
          location: $el.find("[class*='location'],[class*='city']").first().text().trim() || "India",
          price: "Unknown", registrationLink: link, imageUrl: "",
          uniqueId: `konfhub-${name.toLowerCase().replace(/\W+/g, "-").slice(0, 80)}`,
        });
      }
      if (results.length > 0) break;
    } catch (err) {
      logger.warn(`[KonfHub] ${url} failed: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  logger.info(`[KonfHub] Total: ${results.length} events`);
  return results;
}

module.exports = { scrapeKonfhub };
