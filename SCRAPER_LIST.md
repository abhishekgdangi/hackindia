# Complete Scraper List — HackIndia

## HACKATHON SCRAPERS (5 working)

| # | Site | URL | Method | Coverage | Status |
|---|------|-----|--------|----------|--------|
| 1 | **Devpost** | devpost.com | JSON REST API | Global, 50+ hackathons | ✅ Working |
| 2 | **Devfolio** | devfolio.co | REST API | India #1, offline + online | ✅ Working |
| 3 | **Hack2Skill** | hack2skill.com | HTML scrape | India only, industry hackathons | ✅ Working |
| 4 | **AllHackathons** | allhackathons.com | HTML scrape | Global aggregator, all platforms | ✅ Working |
| 5 | **DevEvents** | dev.events | JSON API + HTML | Global developer events | ✅ Working |

### Why these and not others?
| Site | Reason Excluded |
|------|-----------------|
| MLH (mlh.io) | 403 Cloudflare WAF — blocks all scrapers |
| DoraHacks | 404 — API endpoint permanently removed |
| HackerEarth | 404 — Public challenges API removed |
| Unstop | API structure changed, returns 0 results |
| WhereUElevate | Domain dead — DNS not resolved |
| Hackalist | Website exists but returns 0 items |
| Kaggle | Requires auth token to access competitions |
| ChallengePost | Redirects to Devpost (same platform) |

---

## INTERNSHIP SCRAPERS (5 working)

| # | Site | URL | Method | Coverage | Status |
|---|------|-----|--------|----------|--------|
| 1 | **Internshala** | internshala.com | HTML scrape | India #1, 8000+ listings | ✅ Working |
| 2 | **LetsIntern** | letsintern.com | HTML scrape | India, startup internships | ✅ Working |
| 3 | **Fresherworld** | fresherworld.com | HTML scrape | India freshers/interns | ✅ Working |
| 4 | **Remotive** | remotive.com | FREE JSON API | Remote worldwide | ✅ Working |
| 5 | **YCombinator** | workatastartup.com | JSON API + HTML | YC-backed startups, global | ✅ Working |

### Why not others?
| Site | Reason Excluded |
|------|-----------------|
| LinkedIn | Requires login, blocks all bots aggressively |
| Naukri.com | Cloudflare WAF, requires session cookies |
| Indeed | Blocks scrapers, CAPTCHA on every page |
| Glassdoor | Login required, aggressive bot detection |
| Monster.com | Heavy JS rendering + bot detection |
| Twenty19 | Returns empty HTML (React SPA, no SSR) |

---

## Auto-Schedule
- Every 6h → all hackathon scrapers
- Every 12h → all internship scrapers
- Every 1h → expire closed hackathons
- Midnight → daily stats

## Manual Run (debug)
```
node jobs/runScrape.js devpost
node jobs/runScrape.js devfolio
node jobs/runScrape.js hack2skill
node jobs/runScrape.js allhackathons
node jobs/runScrape.js devevents
node jobs/runScrape.js internshala
node jobs/runScrape.js letsintern
node jobs/runScrape.js fresherworld
node jobs/runScrape.js remotive
node jobs/runScrape.js ycombinator
```
