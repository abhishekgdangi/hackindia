/**
 * scrapers/remotive.js
 * Remotive — FREE public API. No auth needed. No WAF.
 * Returns remote tech jobs/internships globally.
 * API: https://remotive.com/api/remote-jobs
 */
const BaseScraper = require("./base");
const logger      = require("../utils/logger");

class RemotiveScraper extends BaseScraper {
  constructor() {
    super("Remotive");
    this.apiUrl = "https://remotive.com/api/remote-jobs";
  }

  async scrape() {
    logger.info("[Remotive] Starting scrape…");
    const now     = new Date();
    const results = [];

    const categories = [
      "software-dev",
      "data",
      "devops-sysadmin",
      "mobile-dev",
    ];

    for (const cat of categories) {
      try {
        const res   = await this.get(this.apiUrl, {
          params: { category: cat, limit: 50 },
          headers: { Accept: "application/json" },
        });

        const jobs = res.data?.jobs || [];
        let added  = 0;

        for (const job of jobs) {
          const intern = this._parse(job, now);
          if (intern) { results.push(intern); added++; }
        }
        logger.info(`[Remotive] ${cat} → ${added} jobs`);
        await this.sleep(1000);
      } catch (e) {
        logger.warn(`[Remotive] ${cat} failed: ${e.message}`);
      }
    }

    logger.info(`[Remotive] Total: ${results.length}`);
    return results;
  }

  _parse(job, now = new Date()) {
    if (!job) return null;

    // Only include intern/fresher/entry-level roles
    const title   = (job.title || "").toLowerCase();
    const isIntern =
      title.includes("intern")   ||
      title.includes("fresher")  ||
      title.includes("trainee")  ||
      title.includes("junior")   ||
      title.includes("graduate") ||
      title.includes("entry");

    if (!isIntern) return null;

    // Skip if older than 60 days
    const posted = job.publication_date ? new Date(job.publication_date) : null;
    if (posted) {
      const daysDiff = (now - posted) / (1000 * 60 * 60 * 24);
      if (daysDiff > 60) return null;
    }

    const company = job.company_name || "Remote Company";
    const apply   = job.url || job.candidate_required_location || "";
    if (!apply) return null;

    // Guess deadline — Remotive jobs usually active for 30 days
    const deadline = posted ? new Date(posted.getTime() + 30 * 24 * 60 * 60 * 1000) : this._futureDate(30);
    if (deadline < now) return null;

    const skills = this._extractSkills(job.title + " " + (job.tags?.join(" ") || ""));

    return {
      company,
      role:      job.title,
      logo:      this._companyLogo(company),
      stipend:   job.salary || "Remote · Paid",
      stipendNumeric: this._parseSalary(job.salary || ""),
      duration:  "3-6 months",
      location:  job.candidate_required_location || "Remote / Worldwide",
      isRemote:  true,
      skills,
      applyLink: apply,
      deadline,
      description: this._stripHtml(job.description || "").slice(0, 300),
      sourcePlatform: "Remotive",
      status:    "OPEN",
      isActive:  true,
      lastScrapedAt: new Date(),
    };
  }

  _stripHtml(html = "") {
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  _parseSalary(str = "") {
    if (!str) return 0;
    const match = str.replace(/,/g, "").match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  }

  _extractSkills(text = "") {
    const skillMap = {
      python: "Python", javascript: "JavaScript", typescript: "TypeScript",
      react: "React", node: "Node.js", java: "Java", go: "Go",
      rust: "Rust", swift: "Swift", kotlin: "Kotlin", flutter: "Flutter",
      docker: "Docker", kubernetes: "Kubernetes", aws: "AWS",
      azure: "Azure", gcp: "GCP", sql: "SQL", mongodb: "MongoDB",
      graphql: "GraphQL", vue: "Vue.js", angular: "Angular",
      django: "Django", flask: "Flask", fastapi: "FastAPI",
      pytorch: "PyTorch", tensorflow: "TensorFlow", "machine learning": "ML",
    };
    const found = new Set();
    const lower = text.toLowerCase();
    for (const [key, val] of Object.entries(skillMap)) {
      if (lower.includes(key)) found.add(val);
    }
    return [...found].slice(0, 5);
  }

  _companyLogo(name = "") {
    const n = name.toLowerCase();
    if (n.includes("google"))    return "🔵";
    if (n.includes("microsoft")) return "💙";
    if (n.includes("amazon"))    return "🟠";
    if (n.includes("meta"))      return "🔷";
    if (n.includes("apple"))     return "⚫";
    if (n.includes("netflix"))   return "🔴";
    if (n.includes("stripe"))    return "🟣";
    if (n.includes("shopify"))   return "🟢";
    if (n.includes("github"))    return "🐙";
    // Colorful unique fallback
    const colors = ["🔴","🟡","🟢","🔵","🟣","🟠","🔶","🔹","🌟","💎","🏆","🎯"];
    return colors[name.charCodeAt(0) % colors.length];
  }
}

module.exports = new RemotiveScraper();
