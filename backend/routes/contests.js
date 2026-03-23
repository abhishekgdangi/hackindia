/**
 * routes/contests.js
 * CP Contest Tracker — strictly CP contests only (no hackathons)
 * Sources: Codeforces + CodeChef + LeetCode + AtCoder + Kontests.net (filtered)
 * Cache: 30 mins. No auth keys.
 */
const express = require("express");
const router  = express.Router();
const logger  = require("../utils/logger");

let cache = { data: [], fetchedAt: 0 };
const CACHE_TTL = 30 * 60 * 1000;
const TIMEOUT   = 12000;

const tf = (url) => fetch(url, {
  headers: { "User-Agent": "Mozilla/5.0 HackIndia/1.0" },
  signal: AbortSignal.timeout(TIMEOUT),
});

// Filter: is this actually a CP contest (not a hackathon/hiring challenge)?
const CP_KEYWORDS = /round|contest|challenge|div\.|division|rated|unrated|cup|championship|grand|educational|weekly|biweekly|monthly|series|starters|cook.?off|lunch.?time|long|short|leet.?code|beginner|regular|agc|abc|arc|atcoder/i;
const NOT_CP = /hackathon|hiring|recruitment|internship|job|pre.?accelerator|studyin|startup|campus|bootcamp|fellowship|scholarship/i;

function isCP(name) {
  if (!name) return false;
  if (NOT_CP.test(name)) return false;
  return true; // Codeforces/CodeChef/LC/AtCoder are always CP
}

function normTime(v) {
  if (!v) return null;
  try { const d = new Date(v); return isNaN(d) ? null : d.toISOString(); } catch { return null; }
}

function normSecs(v) {
  if (!v) return null;
  const s = String(v);
  const hms = s.match(/^(\d+):(\d+):(\d+)$/);
  if (hms) return +hms[1]*3600 + +hms[2]*60 + +hms[3];
  const hrs = s.match(/(\d+\.?\d*)\s*h/i);
  if (hrs) return Math.round(parseFloat(hrs[1])*3600);
  const n = parseFloat(s);
  return isNaN(n) ? null : (n > 100000 ? Math.round(n) : Math.round(n*60));
}

function isUpcoming(startISO) {
  return startISO && new Date(startISO) > new Date(Date.now() - 4*3600*1000);
}

const safe = fn => fn().catch(e => { logger.warn(`[contests] ${e.message}`); return []; });

// ── 1. Codeforces public API ─────────────────────────────────
async function fetchCF() {
  const r = await tf("https://codeforces.com/api/contest.list?gym=false");
  const j = await r.json();
  if (j.status !== "OK") return [];
  const now = Date.now() / 1000;
  return j.result
    .filter(c => (c.phase === "BEFORE" || c.phase === "CODING") && c.startTimeSeconds > now - 7200)
    .slice(0, 40)
    .map(c => ({
      id: `cf_${c.id}`, name: c.name, platform: "codeforces",
      url: `https://codeforces.com/contest/${c.id}`,
      startTime: new Date(c.startTimeSeconds * 1000).toISOString(),
      endTime: new Date((c.startTimeSeconds + c.durationSeconds) * 1000).toISOString(),
      duration: c.durationSeconds,
      status: c.phase === "CODING" ? "RUNNING" : "UPCOMING",
    }));
}

// ── 2. CodeChef public API ───────────────────────────────────
async function fetchCC() {
  const r = await tf("https://www.codechef.com/api/list/contests/all?sort_by=START&sorting_order=asc&offset=0&mode=all");
  const j = await r.json();
  const out = [];
  const map = (arr, status) => (arr || []).forEach(c => {
    const s = normTime(c.contest_start_date_iso || c.contest_start_date);
    if (!s || !isUpcoming(s) || !isCP(c.contest_name)) return;
    out.push({
      id: `cc_${c.contest_code}`, name: c.contest_name, platform: "codechef",
      url: `https://www.codechef.com/${c.contest_code}`, startTime: s,
      endTime: normTime(c.contest_end_date_iso || c.contest_end_date),
      duration: c.contest_duration ? parseInt(c.contest_duration) * 60 : null, status,
    });
  });
  map(j.future_contests, "UPCOMING");
  map(j.present_contests, "RUNNING");
  return out.slice(0, 25);
}

// ── 3. LeetCode public GraphQL ───────────────────────────────
async function fetchLC() {
  const r = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
    body: JSON.stringify({ query: `{ allContests { title titleSlug startTime duration } }` }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const j = await r.json();
  const now = Date.now() / 1000;
  return (j.data?.allContests || [])
    .filter(c => c.startTime > now - 7200)
    .slice(0, 10)
    .map(c => ({
      id: `lc_${c.titleSlug}`, name: c.title, platform: "leetcode",
      url: `https://leetcode.com/contest/${c.titleSlug}`,
      startTime: new Date(c.startTime * 1000).toISOString(),
      endTime: new Date((c.startTime + c.duration) * 1000).toISOString(),
      duration: c.duration,
      status: now > c.startTime && now < c.startTime + c.duration ? "RUNNING" : "UPCOMING",
    }));
}

// ── 4. AtCoder via atcoder-problems.info ────────────────────
async function fetchAC() {
  const r = await tf("https://kenkoooo.com/atcoder/resources/contests.json");
  const j = await r.json();
  const now = Date.now() / 1000;
  return (j || [])
    .filter(c => c.start_epoch_second > now - 7200)
    .sort((a, b) => a.start_epoch_second - b.start_epoch_second)
    .slice(0, 20)
    .map(c => ({
      id: `ac_${c.id}`, name: c.title, platform: "atcoder",
      url: `https://atcoder.jp/contests/${c.id}`,
      startTime: new Date(c.start_epoch_second * 1000).toISOString(),
      endTime: new Date((c.start_epoch_second + c.duration_second) * 1000).toISOString(),
      duration: c.duration_second,
      status: now > c.start_epoch_second && now < c.start_epoch_second + c.duration_second ? "RUNNING" : "UPCOMING",
    }));
}

// ── 5. Kontests.net — CP platforms only (skip HackerEarth which returns hackathons) ──
async function fetchKontests() {
  const platforms = [
    { url: "https://kontests.net/api/v1/code_chef",  platform: "codechef"   },
    { url: "https://kontests.net/api/v1/leet_code",  platform: "leetcode"   },
    { url: "https://kontests.net/api/v1/at_coder",   platform: "atcoder"    },
    { url: "https://kontests.net/api/v1/hacker_rank", platform: "hackerrank" },
    { url: "https://kontests.net/api/v1/top_coder",  platform: "topcoder"   },
    { url: "https://kontests.net/api/v1/cs_academy",  platform: "csacademy" },
  ];
  const results = await Promise.allSettled(
    platforms.map(async ({ url, platform }) => {
      const r = await tf(url);
      const j = await r.json();
      return (Array.isArray(j) ? j : [])
        .filter(c => isCP(c.name))
        .map(c => {
          const s = normTime(c.start_time);
          if (!s || !isUpcoming(s)) return null;
          return {
            id: `kt_${platform}_${Buffer.from(c.name || "x").toString("base64").slice(0, 8)}`,
            name: c.name || "Contest", platform,
            url: c.url || "#",
            startTime: s,
            endTime: normTime(c.end_time),
            duration: normSecs(c.duration),
            status: c.status === "CODING" ? "RUNNING" : "UPCOMING",
          };
        }).filter(Boolean);
    })
  );
  return results.filter(r => r.status === "fulfilled").flatMap(r => r.value);
}

// ── Merge + dedupe + sort ────────────────────────────────────
async function fetchAll() {
  const [cf, cc, lc, ac, kt] = await Promise.allSettled([
    safe(fetchCF), safe(fetchCC), safe(fetchLC), safe(fetchAC), safe(fetchKontests),
  ]);

  const all = [cf, cc, lc, ac, kt]
    .filter(r => r.status === "fulfilled")
    .flatMap(r => r.value);

  // Dedupe by normalised name
  const map = new Map();
  all.forEach(c => {
    const key = c.name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);
    const ex = map.get(key);
    if (!ex || (!ex.duration && c.duration)) map.set(key, c);
  });

  const deduped = [...map.values()];
  deduped.sort((a, b) => {
    if (a.status === "RUNNING" && b.status !== "RUNNING") return -1;
    if (b.status === "RUNNING" && a.status !== "RUNNING") return 1;
    return new Date(a.startTime) - new Date(b.startTime);
  });

  const byPlatform = deduped.reduce((acc, c) => {
    acc[c.platform] = (acc[c.platform] || 0) + 1; return acc;
  }, {});
  logger.info(`[contests] ${deduped.length} contests | ${JSON.stringify(byPlatform)}`);

  return deduped;
}

router.get("/", async (req, res) => {
  try {
    const now = Date.now();
    if (cache.data.length && now - cache.fetchedAt < CACHE_TTL)
      return res.json({ success: true, data: cache.data, cached: true });

    const data = await fetchAll();
    if (data.length) cache = { data, fetchedAt: now };
    res.json({ success: true, data, cached: false });
  } catch (err) {
    logger.error(`[contests] ${err.message}`);
    if (cache.data.length)
      return res.json({ success: true, data: cache.data, cached: true, stale: true });
    res.status(500).json({ success: false, error: "Failed to fetch contests" });
  }
});

module.exports = router;
