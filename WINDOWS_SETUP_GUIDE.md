# 🚀 HackIndia — Complete Windows Setup Guide
### (Written for complete beginners — D:\hackindia2)

---

## 🗂️ What You Already Have

Your D:\hackindia2 folder contains:
```
D:\hackindia2\
├── {backend\        ← IGNORE THIS (broken zip artifact, delete it)
├── backend\         ← ✅ This is correct
├── frontend\        ← ✅ This is correct
└── README.md        ← ✅ Reference guide
```

First thing: **delete the `{backend` folder** — right click → Delete.
Only keep `backend`, `frontend`, and `README.md`.

---

## 📋 WHAT YOU NEED TO INSTALL (in this order)

1. VS Code
2. Node.js
3. MongoDB
4. Git (optional but recommended)

---

## ═══════════════════════════════════════
## PART 1 — INSTALL VS CODE
## ═══════════════════════════════════════

1. Go to → https://code.visualstudio.com
2. Click the big blue "Download for Windows" button
3. Run the installer (VSCodeSetup-x64.exe)
4. During install, CHECK these two boxes:
   ✅ "Add to PATH"
   ✅ "Add 'Open with Code' action to Windows Explorer"
5. Click Install → Finish

**How to open your project in VS Code:**
- Open File Explorer
- Go to D:\hackindia2
- Right-click on empty space inside the folder
- Click "Open with Code"

VS Code will open with your whole project visible on the left panel.

---

## ═══════════════════════════════════════
## PART 2 — INSTALL NODE.JS
## ═══════════════════════════════════════

Node.js is what runs your backend server (like a JavaScript engine for your computer).

1. Go to → https://nodejs.org
2. Download the "LTS" version (the left button, currently 20.x)
   - LTS = Long Term Support = stable and safe
3. Run the installer (.msi file)
4. Keep clicking Next with all defaults
5. On the "Tools for Native Modules" page → CHECK the checkbox
6. Click Install → Finish → It may open a black window to install extras → Let it finish → Press Enter when done

**Check if it worked:**
- Press Windows key → type "cmd" → press Enter (opens Command Prompt)
- Type this and press Enter:
  ```
  node --version
  ```
- You should see something like: v20.11.0
- Also type:
  ```
  npm --version
  ```
- You should see something like: 10.2.3

If you see version numbers → ✅ Node.js is installed correctly.
If you see "not recognized" → restart your computer and try again.

---

## ═══════════════════════════════════════
## PART 3 — INSTALL MONGODB
## ═══════════════════════════════════════

MongoDB is your database — it stores all the hackathon data.

1. Go to → https://www.mongodb.com/try/download/community
2. Select:
   - Version: 7.0 (latest)
   - Platform: Windows
   - Package: msi
3. Click Download
4. Run the downloaded .msi file
5. Choose "Complete" installation type
6. On "Service Configuration" page:
   ✅ Keep "Install MongoDB as a Service" checked
   ✅ "Run service as Network Service user" selected
7. UNCHECK "Install MongoDB Compass" (it's a heavy GUI we don't need)
8. Click Install → Finish

**Check if it worked:**
- Open Command Prompt (Windows key → cmd → Enter)
- Type:
  ```
  mongod --version
  ```
- Should show: db version v7.0.x

MongoDB runs automatically as a Windows service — you don't need to start it manually every time.

**Verify MongoDB is running:**
- Press Windows + R → type `services.msc` → Enter
- Look for "MongoDB" in the list
- Status should say "Running"
- If not: right-click it → Start

---

## ═══════════════════════════════════════
## PART 4 — GET YOUR FREE GROQ API KEY
## ═══════════════════════════════════════

Groq is the FREE AI service that powers hackathon classification and the chatbot.

1. Go to → https://console.groq.com
2. Click "Sign Up" — use Google or GitHub (NO credit card needed)
3. After logging in → click "API Keys" in the left sidebar
4. Click "Create API Key"
5. Give it a name like "hackindia"
6. COPY the key — it starts with `gsk_...`
7. Save it somewhere safe (Notepad) — you only see it once!

Your key will look like:
```
gsk_abcdefghijklmnopqrstuvwxyz1234567890abcdefgh
```

---

## ═══════════════════════════════════════
## PART 5 — OPEN PROJECT IN VS CODE
## ═══════════════════════════════════════

1. Open VS Code
2. Click File → Open Folder
3. Navigate to D:\hackindia2
4. Click "Select Folder"

You'll see the folder structure on the LEFT panel.

**Open the VS Code terminal:**
- Press Ctrl + ` (backtick key, top-left of keyboard, next to 1)
- OR go to View → Terminal
- A terminal opens at the BOTTOM of VS Code

---

## ═══════════════════════════════════════
## PART 6 — CREATE YOUR .ENV FILE
## ═══════════════════════════════════════

The `.env` file holds your secret settings (like your API key).
It's like a config file for your server.

**In the VS Code terminal, type:**
```
cd backend
copy .env.example .env
```

Now open the .env file:
- In the LEFT panel, click backend → click `.env`
- It opens in the editor

**Replace the contents with this** (fill in YOUR values):
```
MONGODB_URI=mongodb://127.0.0.1:27017/hackindia
GROQ_API_KEY=gsk_PASTE_YOUR_KEY_HERE
GROQ_MODEL=llama-3.3-70b-versatile
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
ADMIN_SECRET=hackindia123
SCRAPE_INTERVAL_HOURS=6
REQUEST_DELAY_MS=2000
```

Replace `gsk_PASTE_YOUR_KEY_HERE` with the actual key you copied from Groq.

Press Ctrl+S to save.

---

## ═══════════════════════════════════════
## PART 7 — INSTALL BACKEND PACKAGES
## ═══════════════════════════════════════

In the VS Code terminal (make sure you're in the backend folder — you should see `D:\hackindia2\backend>` in the terminal):

```
npm install
```

This downloads all the libraries the backend needs.
It will take 3–8 minutes because it also downloads Chromium (~170MB) for Puppeteer.

You'll see a progress bar. When done, a `node_modules` folder appears in backend.

**If you see any red "error" text:**
- npm WARN messages (yellow) are fine, ignore them
- If you see "node-pre-gyp" errors, run: `npm install --ignore-scripts`

---

## ═══════════════════════════════════════
## PART 8 — ADD STARTER DATA TO DATABASE
## ═══════════════════════════════════════

This adds 10 hackathons and 8 internships to your database right away,
so the website works immediately (before the scrapers run).

In the VS Code terminal (still in backend folder):
```
node jobs/seed.js
```

Expected output:
```
✅ Seeded 10 hackathons and 8 internships
```

---

## ═══════════════════════════════════════
## PART 9 — START THE BACKEND SERVER
## ═══════════════════════════════════════

In the VS Code terminal:
```
npm start
```

Expected output:
```
✅ MongoDB connected: mongodb://127.0.0.1:27017/hackindia
✅ HackIndia API running at http://localhost:5000
   Groq AI: configured ✔
✅ All cron jobs registered (IST timezone)
DB has 10 open hackathons — no immediate scrape needed
```

🎉 Your backend is running!

**Test it — open your browser and go to:**
```
http://localhost:5000/api/health
```
You should see a JSON response like:
```json
{"status":"ok","db":"connected","openHackathons":10}
```

Also try:
```
http://localhost:5000/api/hackathons
```
You should see your 10 hackathons as JSON data.

**KEEP THIS TERMINAL OPEN** — closing it stops the server.

---

## ═══════════════════════════════════════
## PART 10 — SET UP THE REACT FRONTEND
## ═══════════════════════════════════════

Open a NEW terminal in VS Code:
- Press Ctrl + Shift + ` (opens a second terminal)
- Click the + button in the terminal panel

In this NEW terminal, go BACK to the root hackindia2 folder:
```
cd D:\hackindia2
```

Create a new React app:
```
npx create-react-app hackindia-frontend
```

This takes 3–5 minutes. When done:
```
cd hackindia-frontend
```

**Copy the HackIndia.jsx into the React app:**

Method 1 — In VS Code file explorer:
- Find `D:\hackindia2\frontend\HackIndia.jsx` in the left panel
- Right-click → Copy
- Go to `D:\hackindia2\hackindia-frontend\src\`
- Right-click → Paste
- Delete the old `App.js` in src
- Rename `HackIndia.jsx` to `App.js`

Method 2 — In terminal:
```
copy D:\hackindia2\frontend\HackIndia.jsx D:\hackindia2\hackindia-frontend\src\App.js
```

**Create .env for the frontend:**

In the terminal (you should be in hackindia-frontend folder):
```
echo REACT_APP_API_URL=http://localhost:5000/api > .env
echo REACT_APP_GROQ_KEY=gsk_PASTE_YOUR_KEY_HERE >> .env
```

Replace the key with your actual Groq key.

OR open Notepad, paste this, save as `.env` in `D:\hackindia2\hackindia-frontend\`:
```
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_GROQ_KEY=gsk_YOUR_GROQ_KEY_HERE
```

**Start the frontend:**
```
npm start
```

Your browser should automatically open to `http://localhost:3000` 🎉

---

## ═══════════════════════════════════════
## PART 11 — VERIFY EVERYTHING WORKS
## ═══════════════════════════════════════

You should now have TWO terminals running in VS Code:

Terminal 1 (backend):        shows "HackIndia API running at :5000"
Terminal 2 (frontend):       shows "Compiled successfully! localhost:3000"

Open browser tabs:
✅ http://localhost:3000        → Your website (beautiful UI)
✅ http://localhost:5000/api/health      → Backend health check
✅ http://localhost:5000/api/hackathons  → Raw hackathon data

---

## ═══════════════════════════════════════
## PART 12 — RUN THE SCRAPERS MANUALLY
## ═══════════════════════════════════════

The scrapers run automatically every 6 hours via the cron scheduler.
To run them manually right now:

In a new terminal (backend folder):
```
cd D:\hackindia2\backend
node jobs/runScrape.js
```

This will:
1. Scrape all 7 platforms (Devfolio, Unstop, etc.)
2. Validate each result
3. Classify using Groq AI (free)
4. Save to MongoDB
5. Show: "Scraped: X  Valid: Y  Upserted: Z"

After this, refresh http://localhost:3000 — you'll see live hackathons!

---

## 🔄 EVERY TIME YOU COME BACK

Next day/session, here's all you need to do:

**Step 1 — Check MongoDB is running:**
Press Windows + R → `services.msc` → Find MongoDB → Start if not running

**Step 2 — Start backend:**
```
cd D:\hackindia2\backend
npm start
```

**Step 3 — Start frontend:**
```
cd D:\hackindia2\hackindia-frontend
npm start
```

That's it! Two commands and you're live.

---

## ❌ COMMON ERRORS & FIXES

**"EADDRINUSE port 5000"**
Something else is using port 5000. Fix:
```
# In backend .env, change:
PORT=5001
# In frontend .env, change:
REACT_APP_API_URL=http://localhost:5001/api
```

**"MongoServerError: connect ECONNREFUSED"**
MongoDB isn't running. Fix:
Press Windows + R → services.msc → MongoDB → Start

**"Cannot find module 'groq-sdk'"**
Run again: cd D:\hackindia2\backend && npm install

**"GROQ_API_KEY not set"**
Open D:\hackindia2\backend\.env and verify your key is there (no spaces, no quotes around the value)

**Browser shows blank page**
Open browser console (F12 → Console tab) and look for red errors.
Most common: the API URL is wrong in frontend .env

**Puppeteer / Chrome crashes**
Add this line to backend .env:
```
PUPPETEER_HEADLESS=true
```

---

## 💡 VS CODE TIPS FOR BEGINNERS

- **Ctrl + `** → Open/close terminal
- **Ctrl + S** → Save file
- **Ctrl + Z** → Undo
- **Ctrl + Shift + P** → Command palette (search for anything)
- **Click a file** in left panel → opens it in editor
- **Ctrl + /** → Comment/uncomment a line of code
- Split terminal: click the split icon (⊞) next to the + in terminal panel
