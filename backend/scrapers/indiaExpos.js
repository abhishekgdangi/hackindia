/**
 * scrapers/indiaExpos.js
 * Major India tech expos — scraped from 10times.com + static known expos
 * 10times.com is India's largest event aggregator
 */

const axios   = require("axios");
const cheerio = require("cheerio");
const logger  = require("../utils/logger");

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,*/*;q=0.9",
  "Accept-Language": "en-IN,en;q=0.9",
  "Referer": "https://10times.com",
};

// Known major India tech expos — hardcoded since they have no scrapable API
// Updated annually — these are confirmed 2026 events
const STATIC_EXPOS = [
  {
    title: "Convergence India 2026",
    description: "India's largest ICT expo covering AI, IoT, 6G, Fintech, Blockchain, Cloud, Cybersecurity and Smart Cities. 55,000+ attendees, 500+ exhibitors.",
    eventType: "Conference",
    platform: "IndiaExpos",
    date: "23 Mar 2026",
    location: "New Delhi",
    mode: "Offline",
    price: "Check site",
    registrationLink: "https://www.convergenceindia.org/",
    imageUrl: "",
    uniqueId: "expo-convergence-india-2026",
  },
  {
    title: "AI Bharat Expo 2026",
    description: "India's premier AI conference and exhibition — AI, ML, deep learning, neural networks, responsible AI. Co-located with Convergence India.",
    eventType: "AI/ML Event",
    platform: "IndiaExpos",
    date: "23 Mar 2026",
    location: "New Delhi",
    mode: "Offline",
    price: "Check site",
    registrationLink: "https://www.aibharatexpo.com/",
    imageUrl: "",
    uniqueId: "expo-ai-bharat-2026",
  },
  {
    title: "IoT India Expo 2026",
    description: "India's largest IoT, Blockchain, AI, Big Data, Cyber Security and Cloud enterprise expo. 12,000+ attendees, 575 exhibitors.",
    eventType: "Conference",
    platform: "IndiaExpos",
    date: "23 Mar 2026",
    location: "New Delhi",
    mode: "Offline",
    price: "Check site",
    registrationLink: "https://www.iotindiaexpo.com/",
    imageUrl: "",
    uniqueId: "expo-iot-india-2026",
  },
  {
    title: "Embedded Tech India Expo 2026",
    description: "India's largest embedded systems expo — hardware, system software, tools, OEMs, manufacturers and solution providers.",
    eventType: "Conference",
    platform: "IndiaExpos",
    date: "23 Mar 2026",
    location: "New Delhi",
    mode: "Offline",
    price: "Check site",
    registrationLink: "https://www.embeddedtechexpo.com/",
    imageUrl: "",
    uniqueId: "expo-embedded-tech-india-2026",
  },
  {
    title: "INDIASOFT 2026",
    description: "India's largest international IT and software expo — IT companies, software exporters, startups and electronics innovators from 50+ countries.",
    eventType: "Conference",
    platform: "IndiaExpos",
    date: "23 Mar 2026",
    location: "New Delhi",
    mode: "Offline",
    price: "Check site",
    registrationLink: "https://indiasoft.org/",
    imageUrl: "",
    uniqueId: "expo-indiasoft-2026",
  },
  {
    title: "Automation Expo 2026",
    description: "Asia's largest industrial automation, robotics and smart technologies expo. 65,000+ buyers, Industry 4.0, AI, Robotics, Startups pavilions.",
    eventType: "Conference",
    platform: "IndiaExpos",
    date: "Aug 2026",
    location: "Mumbai",
    mode: "Offline",
    price: "Check site",
    registrationLink: "https://www.automationindiaexpo.com/",
    imageUrl: "",
    uniqueId: "expo-automation-india-2026",
  },
  {
    title: "Smart Future Cities India 2026",
    description: "India's leading smart cities expo — Robotics, Drones, Cybersecurity, Urban Innovation, Smart Mobility, Greentech and ESG.",
    eventType: "Conference",
    platform: "IndiaExpos",
    date: "23 Mar 2026",
    location: "New Delhi",
    mode: "Offline",
    price: "Check site",
    registrationLink: "https://www.smartcitiesindia.com/",
    imageUrl: "",
    uniqueId: "expo-smart-cities-india-2026",
  },
  {
    title: "India Electronics Expo 2026",
    description: "11th edition — India's premier electronics, hardware and software export showcase. Global buyers, MSMEs, startups and tech innovators.",
    eventType: "Conference",
    platform: "IndiaExpos",
    date: "23 Mar 2026",
    location: "New Delhi",
    mode: "Offline",
    price: "Check site",
    registrationLink: "https://www.indiaelectronicsexpo.com/",
    imageUrl: "",
    uniqueId: "expo-india-electronics-2026",
  },
];


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

async function scrapeIndiaExpos() {
  logger.info("[IndiaExpos] Starting scrape…");
  const results = [...STATIC_EXPOS];
  const seen = new Set(STATIC_EXPOS.map(e => e.uniqueId));

  // ── 10times.com — India's largest event aggregator ──────────────
  const tenTimesUrls = [
    "https://10times.com/india/technology",
    "https://10times.com/india/ai-machine-learning",
    "https://10times.com/india/computers-internet",
  ];

  for (const url of tenTimesUrls) {
    try {
      const res = await axios.get(url, { headers: HEADERS, timeout: 20000 });
      const $ = cheerio.load(res.data);

      // 10times event cards
      $("table.tbl-result tr, .event-listing, [class*='event-row'], [class*='conference-row']").each((_, el) => {
        const titleEl = $(el).find("a.event-name, a[class*='title'], h3 a, td.event-name a, .name a").first();
        const title = titleEl.text().trim() || $(el).find("h2,h3,h4").first().text().trim();
        if (!title || title.length < 5) return;

        const href = titleEl.attr("href") || $(el).find("a[href*='10times']").first().attr("href") || "";
        const link = href.startsWith("http") ? href : `https://10times.com${href}`;
        if (!link.includes("10times.com") && !href) return;

        const locText = $(el).find(".city, .location, [class*='location'], [class*='venue'], td.city").first().text().trim();
        const dateText = $(el).find(".date, [class*='date'], time, td.date").first().text().trim();
        const isOnline = locText.toLowerCase().includes("online") || locText.toLowerCase().includes("virtual");

        const uid = `10times-${link.split("/").slice(-2).join("-").replace(/\W+/g,"-").slice(0,70)}`;
        if (seen.has(uid)) return;
        seen.add(uid);

        results.push({
          title,
          description: $(el).find("p, [class*='desc'], [class*='summary']").first().text().trim().slice(0,200) || `Tech expo in ${locText || "India"}`,
          eventType: classifyExpo(title),
          platform: "10times",
          date: dateText,
          location: isOnline ? "Online" : (normalizeCity(locText) || "India"),
          mode: isOnline ? "Online" : "Offline",
          price: "Check site",
          registrationLink: link,
          imageUrl: $(el).find("img").first().attr("src") || "",
          uniqueId: uid,
        });
      });

      logger.info(`[IndiaExpos] 10times ${url.split("/").slice(-2).join("/")}: ${results.length} total`);
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      logger.warn(`[IndiaExpos] 10times failed: ${err.message}`);
    }
  }

  logger.info(`[IndiaExpos] Total: ${results.length} expos`);
  return results;
}

function classifyExpo(title) {
  const t = (title || "").toLowerCase();
  if (t.includes("expo") || t.includes("exhibition") || t.includes("trade show")) return "Conference";
  if (t.includes("summit") || t.includes("conclave") || t.includes("conference")) return "Conference";
  if (t.includes("ai") || t.includes("machine learning") || t.includes("ml ")) return "AI/ML Event";
  if (t.includes("startup") || t.includes("venture") || t.includes("innovation")) return "Startup Event";
  if (t.includes("workshop") || t.includes("training")) return "Workshop";
  return "Conference";
}

module.exports = { scrapeIndiaExpos };
