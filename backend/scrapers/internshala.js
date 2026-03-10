/**
 * scrapers/internshala.js
 * Scrapes real internships from Internshala — India's #1 internship platform.
 * Uses their public search API + HTML fallback.
 */
const cheerio     = require("cheerio");
const BaseScraper = require("./base");
const logger      = require("../utils/logger");

class InternshalaInternshipScraper extends BaseScraper {
  constructor() {
    super("Internshala");
    this.baseUrl = "https://internshala.com";
    this.apiUrl  = "https://internshala.com/internships/";
  }

  async scrape() {
    logger.info("[Internshala] Starting scrape…");
    const results = [];
    const now     = new Date();

    // Categories to scrape
    const categories = [
      "computer-science-internship",
      "web-development-internship",
      "machine-learning-internship",
      "data-science-internship",
      "android-development-internship",
      "python-internship",
    ];

    for (const cat of categories) {
      try {
        const res = await this.get(`${this.apiUrl}${cat}/`, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
              "AppleWebKit/537.36 (KHTML, like Gecko) " +
              "Chrome/125.0.0.0 Safari/537.36",
            Accept:          "text/html,application/xhtml+xml",
            "Accept-Language": "en-IN,en;q=0.9",
            Referer:         "https://internshala.com",
          },
        });

        const $     = cheerio.load(res.data);
        let   added = 0;

        // Try JSON data embedded in page
        const scriptData = $("script#internship-data, script[type='application/json']").first().text();
        if (scriptData) {
          try {
            const parsed = JSON.parse(scriptData);
            const list   = parsed?.internships || parsed?.data || [];
            for (const item of list) {
              const h = this._parseJson(item, now);
              if (h) { results.push(h); added++; }
            }
            if (added > 0) {
              logger.info(`[Internshala] ${cat} JSON → ${added} internships`);
              await this.sleep(1500);
              continue;
            }
          } catch (_) {}
        }

        // HTML card scraping
        $(".internship_meta, .individual_internship, [class*='internship-card']").each((_, el) => {
          try {
            // Extract role name — strip company name if accidentally included
            let name    = $(el).find(".profile, .job-title, h3, .title").first().text().trim();
            let company = $(el).find(".company_name, .company, .org, h4").first().text().trim();
            // Internshala sometimes puts "Role at Company" or "Role Company" in title
            if (name && company && name.toLowerCase().includes(company.toLowerCase())) {
              name = name.replace(new RegExp(company, "gi"), "").replace(/\s+at\s+$/i,"").trim();
            }
            // Also strip "Actively hiring" suffix from company name
            company = company.replace(/\s*Actively\s*hiring\s*/gi, "").trim();
            name    = name.replace(/\s*Actively\s*hiring\s*/gi, "").trim();
            const stipend = $(el).find(".stipend, .salary, [class*='stipend']").first().text().trim();
            const location= $(el).find(".location_link, .location, .city").first().text().trim();
            const duration= $(el).find(".duration, .internship_other_details_row").first().text().trim();
            const href    = $(el).find("a.view_detail_button, a[href*='internship'], a").first().attr("href") || "";
            const deadline= $(el).find(".apply_by, .deadline, [class*='deadline']").first().text().trim();

            if (!name || !company || !href) return;

            const applyLink = href.startsWith("http")
              ? href
              : `${this.baseUrl}${href}`;

            // Parse deadline
            const deadlineDate = this._parseDeadline(deadline, now);
            if (deadlineDate && deadlineDate < now) return;

            // Extract skills from URL or title
            const skills = this._extractSkills(name + " " + cat);

            results.push({
              company:    company.replace(/\s+/g, " ").trim(),
              role:       name.replace(/\s+/g, " ").trim(),
              logo:       this._companyLogo(company),
              stipend:    stipend || "Unpaid",
              stipendNumeric: this._parseStipend(stipend),
              duration:   duration.replace(/\s+/g, " ").trim() || "3 months",
              location:   location || "India",
              isRemote:   location.toLowerCase().includes("work from home") || location.toLowerCase().includes("remote"),
              skills,
              applyLink,
              deadline:   deadlineDate,
              description: `${name} internship at ${company}. Apply now on Internshala.`,
              sourcePlatform: "Internshala",
              status:  "OPEN",
              isActive: true,
              lastScrapedAt: new Date(),
            });
            added++;
          } catch (_) {}
        });

        logger.info(`[Internshala] ${cat} HTML → ${added} internships`);
        await this.sleep(2000);
      } catch (e) {
        logger.warn(`[Internshala] ${cat} failed: ${e.message}`);
      }
    }

    logger.info(`[Internshala] Total internships found: ${results.length}`);
    return results;
  }

  _parseJson(item, now) {
    if (!item) return null;
    const deadline = item.application_deadline || item.deadline;
    if (deadline && new Date(deadline) < now) return null;
    return {
      company:    item.company_name || item.employer_name || "",
      role:       item.profile_name || item.title || "",
      logo:       this._companyLogo(item.company_name || ""),
      stipend:    item.stipend?.salary || item.stipend_string || "Unpaid",
      stipendNumeric: this._parseStipend(item.stipend?.salary || ""),
      duration:   item.duration || "3 months",
      location:   item.location_names?.join(", ") || item.location || "India",
      isRemote:   item.work_from_home || false,
      skills:     item.skills?.map(s => s.name || s) || [],
      applyLink:  item.url
        ? `${this.baseUrl}${item.url}`
        : `${this.baseUrl}/internship/detail/${item.id}`,
      deadline:   deadline ? new Date(deadline) : null,
      sourcePlatform: "Internshala",
      status:     "OPEN",
      isActive:   true,
      lastScrapedAt: new Date(),
    };
  }

  _parseStipend(str = "") {
    if (!str) return 0;
    const clean = str.replace(/[₹,\s]/g, "").toLowerCase();
    const match = clean.match(/(\d+)/);
    if (!match) return 0;
    const n = parseInt(match[1]);
    if (clean.includes("lakh") || clean.includes("lac")) return n * 100000;
    if (clean.includes("k"))   return n * 1000;
    return n;
  }

  _parseDeadline(str = "", now = new Date()) {
    if (!str) return null;
    // Internshala uses formats like "15 Mar" or "15 Mar 2026"
    const clean = str.replace(/apply by|deadline|:/gi, "").trim();
    const d = new Date(clean);
    if (!isNaN(d.getTime())) return d;
    return null;
  }

  _extractSkills(text = "") {
    const skillMap = {
      python: "Python", javascript: "JavaScript", react: "React",
      node: "Node.js", java: "Java", android: "Android",
      kotlin: "Kotlin", flutter: "Flutter", machine: "Machine Learning",
      data: "Data Analysis", sql: "SQL", excel: "Excel",
      django: "Django", flask: "Flask", html: "HTML/CSS",
      "web development": "Web Development", "app development": "App Development",
    };
    const found = [];
    const lower = text.toLowerCase();
    for (const [key, val] of Object.entries(skillMap)) {
      if (lower.includes(key)) found.push(val);
    }
    return found.slice(0, 5);
  }

  _companyLogo(name = "") {
    const n = name.toLowerCase();
    if (n.includes("google"))    return "🔵";
    if (n.includes("microsoft")) return "💙";
    if (n.includes("amazon"))    return "🟠";
    if (n.includes("flipkart"))  return "🟡";
    if (n.includes("zomato"))    return "🔴";
    if (n.includes("swiggy"))    return "🟠";
    if (n.includes("razorpay"))  return "🟢";
    if (n.includes("paytm"))     return "🔵";
    if (n.includes("ibm"))       return "🔷";
    if (n.includes("infosys"))   return "🟦";
    if (n.includes("wipro"))     return "⚫";
    if (n.includes("tcs"))       return "🟣";
    return "💼";
  }
}

module.exports = new InternshalaInternshipScraper();
