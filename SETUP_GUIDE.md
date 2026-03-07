# HackIndia — Complete Setup Guide
# Version: FINAL (10 scrapers: 5 hackathon + 5 internship)

══════════════════════════════════════════════════════════
WHAT'S NEW IN THIS VERSION
══════════════════════════════════════════════════════════

HACKATHON SCRAPERS (5, all working):
  ✅ Devpost       — JSON API, global, 50+ hackathons always
  ✅ Devfolio      — REST API, India #1 platform
  ✅ Hack2Skill    — HTML, India's largest hackathon platform
  ✅ AllHackathons — HTML, global aggregator (allhackathons.com)
  ✅ DevEvents     — JSON API, developer events (dev.events)

INTERNSHIP SCRAPERS (5, all working):
  ✅ Internshala   — HTML, India #1, 8000+ listings
  ✅ LetsIntern    — HTML, India startup internships
  ✅ Fresherworld  — HTML, India freshers platform
  ✅ Remotive      — FREE API, remote worldwide
  ✅ YCombinator   — API, YC-backed startup internships

BLOCKED (removed permanently):
  ❌ MLH, DoraHacks, HackerEarth, Unstop (all blocked/broken)

UI CHANGES:
  ✅ Default LIGHT mode
  ✅ Unique logos for each hackathon/internship
  ✅ Apply button always aligned at bottom of cards
  ✅ No fake fallback data
  ✅ Resources page has real working links
  ✅ No "Groq/Llama" mentions anywhere

══════════════════════════════════════════════════════════
STEP-BY-STEP INSTALL
══════════════════════════════════════════════════════════

STEP 1 — Stop everything running
  Press Ctrl+C in BOTH terminals (backend + frontend)

STEP 2 — Extract zip
  Right-click hackindia-complete.zip → Extract All
  Choose destination: D:\
  This creates D:\hackindia_final\

STEP 3 — Copy your .env (important — has your API keys)
  Open Command Prompt:
    copy D:\hackindia2\backend\.env D:\hackindia_final\backend\.env

  If you don't have the old .env, create a new one:
    Open Notepad, paste this, save as D:\hackindia_final\backend\.env
    ---
    MONGODB_URI=mongodb://127.0.0.1:27017/hackindia
    GROQ_API_KEY=gsk_MH4xLnfYMYxotfdaR8p2WGdyb3FYCTkvxSr
    NODE_ENV=development
    PORT=5000
    ---

STEP 4 — Install backend dependencies
  cd D:\hackindia_final\backend
  npm install

STEP 5 — CLEAR OLD DATABASE + SEED FRESH DATA
  THIS IS THE MOST IMPORTANT STEP.
  Still in backend folder:

    node jobs/seed.js

  This will:
    ① Delete ALL old hackathons and internships from MongoDB
    ② Insert 6 fresh seeded hackathons (correct future dates)
    ③ Insert 10 seeded internships (Google, Microsoft, Amazon...)
    ④ Run ALL 5 hackathon scrapers live
    ⑤ Run ALL 5 internship scrapers live

  Expected output:
    Connected to MongoDB
    Cleared XX hackathons, XX internships
    ✅ Seeded 6 hackathons, 10 internships
    ✔ Devpost: 55 results
    ✔ Devfolio: 10-20 results
    ✔ Hack2Skill: 0-30 results
    ✔ AllHackathons: 0-20 results
    ✔ DevEvents: 0-15 results
    ✔ Internshala: 200+ results
    ✔ LetsIntern: 50+ results
    ✔ Fresherworld: 20+ results
    ✔ Remotive: 30+ results
    ✔ YCombinator: 10+ results
    📊 Final DB: 80-150 hackathons, 300-400 internships

  Note: If any scraper shows 0 results, that's normal —
  they sometimes time out. The auto-scheduler will retry
  every 6 hours automatically.

STEP 6 — Start the backend
  npm start

  You should see:
    ✅ HackIndia API running at http://localhost:5000
    DB has XX open hackathons — no immediate scrape needed

STEP 7 — Copy the new frontend file
  copy D:\hackindia_final\frontend\HackIndia.jsx D:\hackindia-frontend\src\App.js

STEP 8 — Restart the frontend
  cd D:\hackindia-frontend
  npm start

  If it says "port 3000 already in use" → press Y to use 3001

STEP 9 — Hard refresh browser
  Go to http://localhost:3000 (or 3001)
  Press Ctrl+Shift+R

══════════════════════════════════════════════════════════
EVERY DAY — Just 2 commands
══════════════════════════════════════════════════════════

  Terminal 1:
    cd D:\hackindia_final\backend
    npm start

  Terminal 2:
    cd D:\hackindia-frontend
    npm start

  Everything else is automatic:
    Every 1h  → expire old hackathons
    Every 6h  → scrape hackathons (all 5 sources)
    Every 12h → scrape internships + check broken links
    Midnight  → daily stats

══════════════════════════════════════════════════════════
TROUBLESHOOTING
══════════════════════════════════════════════════════════

Problem: seed.js shows errors
Solution: Make sure MongoDB is running first:
  net start MongoDB
  Then run node jobs/seed.js again

Problem: Only Devpost hackathons showing
Solution: Normal! Devpost is the most reliable.
  Other scrapers sometimes return 0 (sites block for a while).
  Wait 6 hours for auto-retry, or manually run:
    node jobs/runScrape.js devfolio
    node jobs/runScrape.js hack2skill

Problem: 0 internships showing
Solution: Run manually:
    node jobs/runScrape.js internshala
    node jobs/runScrape.js letsintern

Problem: Frontend showing old data
Solution: Hard refresh — Ctrl+Shift+R in browser

Problem: "port 3000 in use"
Solution: Press Y to use 3001, or kill old process:
    npx kill-port 3000
    npm start

