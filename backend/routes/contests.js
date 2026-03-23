/**
 * routes/contests.js
 * CP Contest Tracker - fetches from Codeforces + Kontests APIs
 * GET /api/contests - returns upcoming + running contests
 * No API keys needed - all public endpoints
 */

const express = require("express");
const router  = express.Router();
const logger  = require("../utils/logger");

// In-memory cache - refresh every 30 mins
let cache = { data: [], fetchedAt: 0 };
const CACHE_TTL = 30 * 60 * 1000;

// Platform colors and metadata
const PLATFORM_META = {
  codeforces:  { color:"#1a9eee", label:"Codeforces",  icon:"CF" },
  codechef:    { color:"#9c4a17", label:"CodeChef",    icon:"CC" },
  leetcode:    { color:"#f89f1b", label:"LeetCode",    icon:"LC" },
  atcoder:     { color:"#222222", label:"AtCoder",     icon:"AC" },
  hackerearth: { color:"#3d7ef9", label:"HackerEarth", icon:"HE" },
  hackerrank:  { color:"#2ec866", label:"HackerRank",  icon:"HR" },
  topcoder:    { color:"#ef3b45", label:"TopCoder",    icon:"TC" },
};

// Fetch Codeforces contests (public API, no key)
async function fetchCodeforces() {
  try {
    const res  = await fetch("https://codeforces.com/api/contest.list?gym=false", {
      signal: AbortSignal.timeout(8000)
    });
    const json = await res.json();
    if (json.status !== "OK") return [];

    const now = Date.now() / 1000;
    return json.result
      .filter(c => c.phase === "BEFORE" || c.phase === "CODING")
      .filter(c => c.startTimeSeconds > now - 7200) // started at most 2h ago
      .slice(0, 30)
      .map(c => ({
        id:        `cf_${c.id}`,
        name:      c.name,
        platform:  "codeforces",
        url:       `https://codeforces.com/contest/${c.id}`,
        startTime: new Date(c.startTimeSeconds * 1000).toISOString(),
        endTime:   new Date((c.startTimeSeconds + c.durationSeconds) * 1000).toISOString(),
        duration:  c.durationSeconds,
        status:    c.phase === "CODING" ? "RUNNING" : "UPCOMING",
      }));
  } catch (err) {
    logger.warn(`[contests] Codeforces fetch failed: ${err.message}`);
    return [];
  }
}

// Fetch from Kontests API (covers CodeChef, LeetCode, AtCoder, HackerEarth)
async function fetchKontests() {
  const endpoints = [
    { url:"https://kontests.net/api/v1/code_chef",    platform:"codechef" },
    { url:"https://kontests.net/api/v1/leet_code",    platform:"leetcode" },
    { url:"https://kontests.net/api/v1/at_coder",     platform:"atcoder" },
    { url:"https://kontests.net/api/v1/hacker_earth", platform:"hackerearth" },
    { url:"https://kontests.net/api/v1/hacker_rank",  platform:"hackerrank" },
    { url:"https://kontests.net/api/v1/top_coder",    platform:"topcoder" },
  ];

  const results = await Promise.allSettled(
    endpoints.map(async ({ url, platform }) => {
      const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const json = await res.json();
      return (Array.isArray(json) ? json : []).map(c => ({
        id:        `${platform}_${Buffer.from(c.name||"").toString("base64").slice(0,10)}`,
        name:      c.name || "Unnamed Contest",
        platform,
        url:       c.url || "#",
        startTime: c.start_time ? new Date(c.start_time).toISOString() : null,
        endTime:   c.end_time   ? new Date(c.end_time).toISOString()   : null,
        duration:  c.duration   ? parseDuration(c.duration) : null,
        status:    c.status === "CODING" ? "RUNNING" : "UPCOMING",
      })).filter(c => c.startTime && new Date(c.startTime) > new Date(Date.now() - 7200000));
    })
  );

  return results
    .filter(r => r.status === "fulfilled")
    .flatMap(r => r.value);
}

// Parse duration strings like "2:00:00" or "1.5 hours"
function parseDuration(d) {
  if (!d) return null;
  if (typeof d === "number") return d;
  const str = String(d);
  const hms = str.match(/^(\d+):(\d+):(\d+)$/);
  if (hms) return parseInt(hms[1])*3600 + parseInt(hms[2])*60 + parseInt(hms[3]);
  const hrs = str.match(/(\d+\.?\d*)\s*h/i);
  if (hrs) return Math.round(parseFloat(hrs[1]) * 3600);
  return null;
}

// Merge + dedupe + sort
async function fetchAll() {
  const [cf, kontests] = await Promise.all([fetchCodeforces(), fetchKontests()]);
  const all = [...cf, ...kontests];

  // Dedupe by name similarity
  const seen = new Set();
  const deduped = all.filter(c => {
    const key = c.name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort: RUNNING first, then by startTime
  deduped.sort((a, b) => {
    if (a.status === "RUNNING" && b.status !== "RUNNING") return -1;
    if (b.status === "RUNNING" && a.status !== "RUNNING") return 1;
    return new Date(a.startTime) - new Date(b.startTime);
  });

  return deduped;
}

router.get("/", async (req, res) => {
  try {
    const now = Date.now();

    // Return cache if fresh
    if (cache.data.length && now - cache.fetchedAt < CACHE_TTL) {
      return res.json({ success: true, data: cache.data, cached: true, platforms: PLATFORM_META });
    }

    const data = await fetchAll();
    cache = { data, fetchedAt: now };

    res.json({ success: true, data, cached: false, platforms: PLATFORM_META });
  } catch (err) {
    logger.error(`[contests] ${err.message}`);
    // Return stale cache on error
    if (cache.data.length) {
      return res.json({ success: true, data: cache.data, cached: true, stale: true, platforms: PLATFORM_META });
    }
    res.status(500).json({ success: false, error: "Failed to fetch contests" });
  }
});

module.exports = router;
