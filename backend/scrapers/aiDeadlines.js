/**
 * scrapers/aiDeadlines.js
 * aideadlin.es — AI/ML conference submission deadlines
 * Data is in YAML embedded in a GitHub repo, but the site also renders JSON.
 */

const axios  = require("axios");
const logger = require("../utils/logger");

async function scrapeAiDeadlines() {
  logger.info("[AiDeadlines] Starting scrape…");
  const results = [];

  // aideadlin.es source data is on GitHub as YAML — fetch the raw JSON they compile
  const SOURCES = [
    "https://aideadlin.es/",  // main site
  ];

  // Primary: fetch the raw conferences.yml from the site's GitHub repo
  try {
    const raw = await axios.get(
      "https://raw.githubusercontent.com/abhshkdz/ai-deadlines/gh-pages/_data/conferences.yml",
      { timeout: 20000 }
    );
    // Parse minimal YAML manually — each entry starts with "- title:"
    const text  = raw.data || "";
    const lines = text.split("\n");
    let current = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith("- title:")) {
        if (current && current.title) results.push(current);
        current = {
          title:       trimmed.replace("- title:", "").trim().replace(/^['"]|['"]$/g, ""),
          year:        "",
          deadline:    "",
          date:        "",
          location:    "",
          link:        "",
        };
      } else if (current) {
        const kv = (key) => {
          const m = trimmed.match(new RegExp(`^${key}:\\s*(.+)`));
          return m ? m[1].trim().replace(/^['"]|['"]$/g, "") : null;
        };
        if (kv("year"))     current.year     = kv("year");
        if (kv("deadline")) current.deadline = kv("deadline");
        if (kv("date"))     current.date     = kv("date");
        if (kv("place"))    current.location = kv("place");
        if (kv("link"))     current.link     = kv("link");
      }
    }
    if (current && current.title) results.push(current);

    // Filter out past deadlines
    const now = new Date();
    const filtered = results.filter(r => {
      if (!r.deadline || r.deadline === "TBD" || r.deadline === "%y") return true;
      try {
        return new Date(r.deadline) >= now;
      } catch (_) {
        return true;
      }
    });

    logger.info(`[AiDeadlines] ${filtered.length} upcoming deadlines from YAML`);

    return filtered.map(r => ({
      title:            `${r.title} ${r.year || ""}`.trim(),
      description:      `Submission deadline: ${r.deadline || "TBD"}. Conference date: ${r.date || "TBD"}`,
      eventType:        "AI/ML Event",
      platform:         "AI Deadlines",
      date:             r.deadline || r.date || "",
      location:         r.location || "Global",
      price:            "Unknown",
      registrationLink: r.link || "https://aideadlin.es",
      imageUrl:         "",
      uniqueId:         `aideadlines-${(r.title + r.year).toLowerCase().replace(/\W+/g, "-").slice(0, 60)}`,
    }));
  } catch (err) {
    logger.warn(`[AiDeadlines] GitHub YAML failed: ${err.message}`);
  }

  // Fallback: scrape the HTML page
  try {
    const axios2  = require("axios");
    const cheerio = require("cheerio");
    const res     = await axios2.get("https://aideadlin.es/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
      },
      timeout: 20000,
    });
    const $ = cheerio.load(res.data);

    $("tr.conf, .conf-row, table tbody tr").each((_, el) => {
      const cells = $(el).find("td, th").map((_, c) => $(c).text().trim()).get();
      if (cells.length < 3) return;
      const title = cells[0] || "";
      if (!title || title.length < 2) return;
      const uid = `aideadlines-html-${title.toLowerCase().replace(/\W+/g, "-").slice(0, 60)}`;
      results.push({
        title,
        description: `AI/ML conference: ${cells.join(" | ")}`.slice(0, 300),
        eventType:   "AI/ML Event",
        platform:    "AI Deadlines",
        date:        cells[2] || cells[1] || "",
        location:    cells[3] || "Global",
        price:       "Unknown",
        registrationLink: $(el).find("a[href]").first().attr("href") || "https://aideadlin.es",
        imageUrl:    "",
        uniqueId:    uid,
      });
    });

    logger.info(`[AiDeadlines] HTML fallback: ${results.length} items`);
  } catch (htmlErr) {
    logger.error(`[AiDeadlines] HTML fallback failed: ${htmlErr.message}`);
  }

  const seen = new Set();
  return results.filter(e => {
    if (seen.has(e.uniqueId)) return false;
    seen.add(e.uniqueId);
    return true;
  });
}

module.exports = { scrapeAiDeadlines };
