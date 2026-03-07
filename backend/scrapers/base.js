/**
 * scrapers/base.js
 * BaseScraper — shared HTTP client, normaliser, and helpers.
 * Every platform scraper extends this class.
 */

const axios  = require("axios");
const logger = require("../utils/logger");

class BaseScraper {
  constructor(name) {
    this.name  = name;
    this.delay = parseInt(process.env.REQUEST_DELAY_MS || "2000");

    this.http = axios.create({
      timeout: 20000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/125.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
      },
    });
  }

  /** Polite delay between requests */
  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms !== undefined ? ms : this.delay));
  }

  /** GET with retry */
  async get(url, options = {}, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        return await this.http.get(url, options);
      } catch (err) {
        const code = err.response?.status;
        logger.warn(`[${this.name}] GET ${url} attempt ${i + 1}/${retries} — ${code || err.message}`);
        if (i < retries - 1) await this.sleep(this.delay * (i + 1));
        else throw err;
      }
    }
  }

  /**
   * normalise(raw) — maps raw scraped fields to the Hackathon model shape.
   * Subclasses call this.normalise({...}) at the end of their _parse methods.
   */
  normalise(raw) {
    const min = Number(raw.teamSizeMin) || 1;
    const max = Number(raw.teamSizeMax) || 4;

    return {
      name:      (raw.name || "").trim(),
      organizer: (raw.organizer || "").trim(),
      mode:      this._mode(raw.mode),
      city:      (raw.city || "Online").trim(),
      state:     (raw.state || "").trim(),
      country:   (raw.country || "India").trim(),

      startDate:            raw.startDate ? new Date(raw.startDate) : null,
      endDate:              raw.endDate   ? new Date(raw.endDate)   : null,
      registrationDeadline: raw.registrationDeadline
        ? new Date(raw.registrationDeadline)
        : this._futureDate(21),

      prize:         (raw.prize || "TBA").trim(),
      prizeNumeric:  this._prizeNum(raw.prize),
      teamSizeMin:   min,
      teamSizeMax:   max,
      teamSizeLabel: raw.teamSizeLabel || (min === max ? `${min}` : `${min}–${max}`),

      domains:     this._domains(raw.domains || raw.tags || []),
      tags:        (raw.tags || []).map(String),
      level:       this._level(raw.level),
      eligibility: (raw.eligibility || "").trim(),
      description: (raw.description || "").trim().slice(0, 1200),

      applyLink:   (raw.applyLink || raw.link || "").trim(),
      websiteLink: (raw.websiteLink || raw.applyLink || "").trim(),
      sourceUrl:   (raw.sourceUrl || "").trim(),

      sourcePlatform: this.name,
      externalId:     String(raw.externalId || raw.id || ""),

      logo:              raw.logo || "🚀",
      registrationCount: Number(raw.registrationCount) || 0,
      isFeatured:        Boolean(raw.isFeatured),
    };
  }

  // ── Private helpers ─────────────────────────────────────────────

  _mode(raw = "") {
    const m = raw.toString().toLowerCase();
    if (m.includes("online") && m.includes("offline")) return "Online + Offline";
    if (m.includes("offline") || m.includes("in-person") || m.includes("onsite")) return "Offline";
    if (m.includes("online") || m.includes("virtual") || m.includes("remote"))    return "Online";
    return "Unknown";
  }

  _level(raw = "") {
    const l = raw.toString().toLowerCase();
    if (l.includes("inter") || l.includes("global")) return "International";
    if (l.includes("nation"))                          return "National";
    if (l.includes("region"))                          return "Regional";
    if (l.includes("city"))                            return "City";
    if (l.includes("college") || l.includes("campus")) return "College";
    return "Unknown";
  }

  _prizeNum(prize = "") {
    if (!prize) return 0;
    const s = prize.toString().replace(/[₹$€£, ]/g, "");
    const n = parseFloat(s.match(/[\d.]+/)?.[0] || "0");
    if (!n) return 0;
    if (/crore/i.test(prize))      return Math.round(n * 10000000);
    if (/lakh|lac/i.test(prize))   return Math.round(n * 100000);
    if (/k\b/i.test(prize))        return Math.round(n * 1000);
    return Math.round(n);
  }

  _domains(raw = []) {
    const MAP = {
      "machine learning":"AI/ML","deep learning":"AI/ML","artificial intelligence":"AI/ML",
      "ai":"AI/ML","ml":"AI/ML","nlp":"AI/ML","computer vision":"AI/ML","llm":"AI/ML",
      "web development":"Web Dev","web":"Web Dev","frontend":"Web Dev","backend":"Web Dev",
      "fullstack":"Web Dev","javascript":"Web Dev","react":"Web Dev","nodejs":"Web Dev",
      "blockchain":"Blockchain","web3":"Blockchain","defi":"Blockchain","nft":"Blockchain",
      "smart contract":"Blockchain","crypto":"Blockchain","solidity":"Blockchain",
      "cybersecurity":"Cybersecurity","security":"Cybersecurity","ctf":"Cybersecurity",
      "ethical hacking":"Cybersecurity","penetration testing":"Cybersecurity",
      "data science":"Data Science","data analytics":"Data Science","analytics":"Data Science",
      "big data":"Data Science","pandas":"Data Science","statistics":"Data Science",
      "cloud":"Cloud","aws":"Cloud","azure":"Cloud","gcp":"Cloud","devops":"Cloud",
      "kubernetes":"Cloud","docker":"Cloud","terraform":"Cloud",
      "android":"Mobile Apps","ios":"Mobile Apps","mobile":"Mobile Apps",
      "flutter":"Mobile Apps","react native":"Mobile Apps","kotlin":"Mobile Apps",
      "iot":"IoT","internet of things":"IoT","embedded":"IoT","arduino":"IoT","raspberry":"IoT",
      "ar":"AR/VR","vr":"AR/VR","augmented reality":"AR/VR","virtual reality":"AR/VR",
      "open source":"Open Source","robotics":"Robotics","hardware":"Robotics",
      "fintech":"FinTech","finance":"FinTech","payments":"FinTech",
      "healthtech":"HealthTech","health":"HealthTech","medical":"HealthTech",
      "edtech":"EdTech","education":"EdTech","elearning":"EdTech",
      "gamedev":"GameDev","gaming":"GameDev","game":"GameDev",
    };
    const out = new Set();
    for (const d of raw) {
      const key    = d.toString().toLowerCase().trim();
      const mapped = MAP[key];
      if (mapped)     out.add(mapped);
      else if (d.trim()) out.add(d.toString().trim());
    }
    return [...out].slice(0, 8);
  }

  _futureDate(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
  }

  /** Must be overridden by subclass */
  async scrape() {
    throw new Error(`${this.name}.scrape() not implemented`);
  }
}

module.exports = BaseScraper;
