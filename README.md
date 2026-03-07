# ⚡ HackIndia — Complete Setup Guide

India's #1 AI-powered hackathon discovery platform
Groq (FREE) + Llama 3.3 · 7 scrapers · MongoDB · React

---

## ⚠️  CAN YOU USE AN API KEY FROM GITHUB?

**NO. Never do this.**

- GitHub **auto-scans** all repos and **revokes leaked keys within minutes**
- Keys you find on GitHub are **already dead/invalid**
- Using someone else's key violates ToS and can get accounts **permanently banned**
- It's also just plain **unethical** — they pay, you use

**Groq is 100% FREE** — takes 2 minutes to get your own key:
1. Go to https://console.groq.com
2. Sign up with Google or GitHub — no credit card ever
3. Click API Keys → Create API Key
4. Copy the key starting with `gsk_...`
5. Paste it in your `.env` as `GROQ_API_KEY=gsk_...`

Free limits: **14,400 requests/day · 500,000 tokens/minute · $0 forever**

---

## 📁 Correct File Structure

```
hackindia/
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── .env.example
│   ├── models/
│   │   ├── Hackathon.js
│   │   ├── Internship.js
│   │   └── AgentLog.js
│   ├── scrapers/
│   │   ├── base.js
│   │   ├── devfolio.js
│   │   ├── unstop.js
│   │   ├── hackerearth.js
│   │   ├── dorahacks.js
│   │   ├── mlh.js
│   │   ├── devpost.js
│   │   ├── puppeteer.js
│   │   └── index.js
│   ├── agents/
│   │   ├── classificationAgent.js   (Groq + Llama 3.3 FREE)
│   │   ├── validationAgent.js
│   │   └── updateAgent.js
│   ├── jobs/
│   │   ├── scheduler.js
│   │   ├── runScrape.js
│   │   └── seed.js
│   ├── routes/
│   │   ├── hackathons.js
│   │   └── internships.js
│   └── utils/
│       └── logger.js
└── frontend/
    └── HackIndia.jsx
```

---

## 🔧 STEP 0 — Install Prerequisites

### Node.js 18+
```bash
node --version   # must be 18+

# Ubuntu/WSL — install Node 20:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# macOS:
brew install node

# Windows: https://nodejs.org — download LTS installer
```

### MongoDB
```bash
# Ubuntu/WSL:
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update && sudo apt-get install -y mongodb-org
sudo systemctl start mongod && sudo systemctl enable mongod

# macOS:
brew tap mongodb/brew && brew install mongodb-community
brew services start mongodb-community

# Verify:
mongosh --eval "db.adminCommand('ping')"
# Output: { ok: 1 }
```

---

## 🚀 STEP 1 — Create the Project Folders

```bash
mkdir hackindia && cd hackindia
mkdir -p backend/{models,scrapers,agents,jobs,routes,utils}
mkdir frontend
```

---

## 📄 STEP 2 — Copy All Files

Copy each file from the provided scripts into the paths below.
Every file is already written — just paste them in the right location.

Files to create (in order):

```
backend/package.json
backend/.env.example
backend/utils/logger.js
backend/models/Hackathon.js
backend/models/Internship.js
backend/models/AgentLog.js
backend/scrapers/base.js
backend/scrapers/devfolio.js
backend/scrapers/unstop.js
backend/scrapers/hackerearth.js
backend/scrapers/dorahacks.js
backend/scrapers/mlh.js
backend/scrapers/devpost.js
backend/scrapers/puppeteer.js
backend/scrapers/index.js
backend/agents/classificationAgent.js
backend/agents/validationAgent.js
backend/agents/updateAgent.js
backend/jobs/scheduler.js
backend/jobs/seed.js
backend/jobs/runScrape.js
backend/routes/hackathons.js
backend/routes/internships.js
backend/server.js
frontend/HackIndia.jsx
```

---

## 🔑 STEP 3 — Create Your .env File

```bash
cd backend
cp .env.example .env
nano .env       # or use VS Code, Notepad, etc.
```

Fill in:
```env
MONGODB_URI=mongodb://127.0.0.1:27017/hackindia
GROQ_API_KEY=gsk_YOUR_KEY_HERE
GROQ_MODEL=llama-3.3-70b-versatile
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
ADMIN_SECRET=any_random_string
SCRAPE_INTERVAL_HOURS=6
REQUEST_DELAY_MS=2000
```

---

## 📦 STEP 4 — Install Backend Dependencies

```bash
cd backend
npm install
```

This downloads: express, mongoose, groq-sdk, cheerio, puppeteer (+ Chromium ~170MB), winston, node-cron, axios, cors, helmet, dotenv, express-rate-limit

Takes 3–7 minutes for first install.

---

## 🌱 STEP 5 — Seed the Database

```bash
node jobs/seed.js
```

Expected output:
```
✅ Seeded 10 hackathons and 8 internships
```

---

## ▶️ STEP 6 — Start the Backend

```bash
npm start
```

Expected:
```
✅ MongoDB connected
✅ HackIndia API running at http://localhost:5000
   Groq AI: configured ✔
✅ All cron jobs registered (IST)
```

---

## 🧪 STEP 7 — Test the API

Open another terminal:

```bash
# Health
curl http://localhost:5000/api/health

# All hackathons
curl http://localhost:5000/api/hackathons | head -c 500

# Filter by domain
curl "http://localhost:5000/api/hackathons?domain=AI%2FML&sort=prize"

# Stats
curl http://localhost:5000/api/hackathons/stats
```

---

## 🎨 STEP 8 — Set Up the React Frontend

### Create React App (recommended for beginners):
```bash
cd ..
npx create-react-app hackindia-frontend
cd hackindia-frontend
```

Copy HackIndia.jsx → replace src/App.js contents (or rename to App.jsx).

Create `.env` in the frontend folder:
```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_GROQ_KEY=gsk_YOUR_KEY_HERE
```

```bash
npm start
# Opens http://localhost:3000
```

### Vite (faster, modern):
```bash
cd ..
npm create vite@latest hackindia-frontend -- --template react
cd hackindia-frontend && npm install
```

Copy HackIndia.jsx → src/App.jsx

Create `.env`:
```env
VITE_API_URL=http://localhost:5000/api
VITE_GROQ_KEY=gsk_YOUR_KEY_HERE
```

Change 2 lines in HackIndia.jsx:
```js
// OLD:
const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";
const GROQ_KEY = process.env.REACT_APP_GROQ_KEY || "";

// NEW (Vite):
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const GROQ_KEY = import.meta.env.VITE_GROQ_KEY || "";
```

```bash
npm run dev
# Opens http://localhost:5173
```

---

## ⚡ Manual Scraping Commands

```bash
cd backend

# Full pipeline: scrape all → validate → classify → save to DB
node jobs/runScrape.js

# Single platform (prints results, doesn't save):
node jobs/runScrape.js devfolio
node jobs/runScrape.js unstop
node jobs/runScrape.js hackerearth
node jobs/runScrape.js dorahacks
node jobs/runScrape.js mlh
node jobs/runScrape.js devpost
```

---

## 🌐 API Endpoints Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Server + DB status |
| GET | /api/agent-status | Last 10 AI agent runs |
| GET | /api/hackathons | List (filters below) |
| GET | /api/hackathons/featured | Top 6 featured |
| GET | /api/hackathons/stats | Counts + prize pool |
| GET | /api/hackathons/:slug | Single detail |
| POST | /api/hackathons/:id/bookmark | +1 bookmark |
| POST | /api/hackathons/admin/run-pipeline | Force scrape |
| GET | /api/internships | List internships |

Filter params: `?domain=AI/ML&mode=Online&city=Bangalore&sort=prize&search=blockchain&page=1&limit=20`

---

## 🚀 Free Deployment (Production)

### MongoDB Atlas (FREE 512MB)
1. Go to cloud.mongodb.com → Create free cluster (M0)
2. Database Access → Add user with password
3. Network Access → Add IP → 0.0.0.0/0
4. Connect → Drivers → Copy URI
5. Use it as `MONGODB_URI` in prod env

### Backend on Render (FREE)
1. Push `backend/` to GitHub
2. render.com → New Web Service → Connect repo
3. Build: `npm install` | Start: `npm start`
4. Add env vars (MONGODB_URI, GROQ_API_KEY, etc.)

### Frontend on Vercel (FREE)
1. Push `hackindia-frontend/` to GitHub
2. vercel.com → Import project
3. Add env var: `REACT_APP_API_URL=https://your-render-url.onrender.com/api`

**Total monthly cost: ₹0**

---

## 🐛 Troubleshooting

**MongoDB not connecting**
```bash
sudo systemctl start mongod        # Linux
brew services start mongodb-community  # macOS
```

**Groq key error**
```bash
# Check no spaces or quotes:
cat .env | grep GROQ
# Should show: GROQ_API_KEY=gsk_xxx   (no quotes)
```

**Puppeteer fails on Linux**
```bash
sudo apt-get install -y libgbm-dev libnss3 libatk-bridge2.0-0 libgtk-3-0 libxss1
```

**CORS error in browser**
```bash
# backend .env:
FRONTEND_URL=http://localhost:3000    # for CRA
FRONTEND_URL=http://localhost:5173    # for Vite
```

**Port 5000 already in use**
```bash
# Change in .env:
PORT=5001
# And update frontend .env:
REACT_APP_API_URL=http://localhost:5001/api
```

---

## 🆓 All APIs Used (100% Free)

| Tool | Purpose | Cost |
|------|---------|------|
| Groq API | AI classification + HackBot chatbot | FREE forever |
| Llama 3.3 70B | Model on Groq | FREE on Groq |
| MongoDB Atlas | Database | FREE (512MB) |
| Render | Backend hosting | FREE tier |
| Vercel | Frontend hosting | FREE tier |
