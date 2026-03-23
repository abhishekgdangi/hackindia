/**
 * routes/contests.js
 * CP Contest Tracker
 * Sources: Codeforces API (public) + CodeChef API (public) + LeetCode GraphQL (public)
 * No API keys needed. Cache 30 mins.
 */

const express = require("express");
const router  = express.Router();
const logger  = require("../utils/logger");

let cache = { data: [], fetchedAt: 0 };
const CACHE_TTL = 30 * 60 * 1000;

// ── Codeforces (public REST API) ─────────────────────────────
async function fetchCodeforces() {
  try {
    const res  = await fetch("https://codeforces.com/api/contest.list?gym=false",
      { signal: AbortSignal.timeout(10000) });
    const json = await res.json();
    if (json.status !== "OK") return [];
    const now = Date.now() / 1000;
    return json.result
      .filter(c => (c.phase === "BEFORE" || c.phase === "CODING") && c.startTimeSeconds > now - 7200)
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
  } catch (e) {
    logger.warn(`[contests] Codeforces: ${e.message}`);
    return [];
  }
}

// ── CodeChef (public contest list page scrape) ───────────────
async function fetchCodeChef() {
  try {
    const res  = await fetch("https://www.codechef.com/api/list/contests/all?sort_by=START&sorting_order=asc&offset=0&mode=all",
      { headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10000) });
    const json = await res.json();
    const now  = new Date();
    const contests = [];

    const toISO = (s) => { try { return new Date(s).toISOString(); } catch { return null; } };

    (json.future_contests  || []).forEach(c => {
      const start = toISO(c.contest_start_date_iso || c.contest_start_date);
      if (!start) return;
      contests.push({
        id:        `cc_${c.contest_code}`,
        name:      c.contest_name,
        platform:  "codechef",
        url:       `https://www.codechef.com/${c.contest_code}`,
        startTime: start,
        endTime:   toISO(c.contest_end_date_iso || c.contest_end_date),
        duration:  c.contest_duration ? parseInt(c.contest_duration) * 60 : null,
        status:    "UPCOMING",
      });
    });

    (json.present_contests || []).forEach(c => {
      const start = toISO(c.contest_start_date_iso || c.contest_start_date);
      contests.push({
        id:        `cc_${c.contest_code}`,
        name:      c.contest_name,
        platform:  "codechef",
        url:       `https://www.codechef.com/${c.contest_code}`,
        startTime: start,
        endTime:   toISO(c.contest_end_date_iso || c.contest_end_date),
        duration:  c.contest_duration ? parseInt(c.contest_duration) * 60 : null,
        status:    "RUNNING",
      });
    });

    return contests.slice(0, 20);
  } catch (e) {
    logger.warn(`[contests] CodeChef: ${e.message}`);
    return [];
  }
}

// ── LeetCode (public GraphQL) ────────────────────────────────
async function fetchLeetCode() {
  try {
    const body = JSON.stringify({
      query: `{ allContests { title titleSlug startTime duration __typename } }`,
    });
    const res  = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
      body,
      signal: AbortSignal.timeout(10000),
    });
    const json = await res.json();
    const now  = Date.now() / 1000;
    return (json.data?.allContests || [])
      .filter(c => c.startTime > now - 7200)
      .slice(0, 10)
      .map(c => ({
        id:        `lc_${c.titleSlug}`,
        name:      c.title,
        platform:  "leetcode",
        url:       `https://leetcode.com/contest/${c.titleSlug}`,
        startTime: new Date(c.startTime * 1000).toISOString(),
        endTime:   new Date((c.startTime + c.duration) * 1000).toISOString(),
        duration:  c.duration,
        status:    now > c.startTime && now < c.startTime + c.duration ? "RUNNING" : "UPCOMING",
      }));
  } catch (e) {
    logger.warn(`[contests] LeetCode: ${e.message}`);
    return [];
  }
}

// ── AtCoder (public problems API proxy) ─────────────────────
async function fetchAtCoder() {
  try {
    // AtCoder doesn't have a public API, use atcoder-problems
    const res  = await fetch("https://kenkoooo.com/atcoder/resources/contests.json",
      { signal: AbortSignal.timeout(10000) });
    const json = await res.json();
    const now  = Date.now() / 1000;
    return (json || [])
      .filter(c => c.start_epoch_second > now - 7200)
      .sort((a,b) => a.start_epoch_second - b.start_epoch_second)
      .slice(0, 15)
      .map(c => ({
        id:        `ac_${c.id}`,
        name:      c.title,
        platform:  "atcoder",
        url:       `https://atcoder.jp/contests/${c.id}`,
        startTime: new Date(c.start_epoch_second * 1000).toISOString(),
        endTime:   new Date((c.start_epoch_second + c.duration_second) * 1000).toISOString(),
        duration:  c.duration_second,
        status:    now > c.start_epoch_second && now < c.start_epoch_second + c.duration_second ? "RUNNING" : "UPCOMING",
      }));
  } catch (e) {
    logger.warn(`[contests] AtCoder: ${e.message}`);
    return [];
  }
}

// ── HackerEarth (public upcoming) ───────────────────────────
async function fetchHackerEarth() {
  try {
    const res  = await fetch("https://www.hackerearth.com/chrome-extension/events/",
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000) });
    const json = await res.json();
    const now  = new Date();
    return (json.response || [])
      .filter(c => new Date(c.start_utc_tz) > now || c.status === "ONGOING")
      .slice(0, 10)
      .map(c => ({
        id:        `he_${c.url?.split("/").filter(Boolean).pop() || Math.random()}`,
        name:      c.title,
        platform:  "hackerearth",
        url:       c.url,
        startTime: c.start_utc_tz ? new Date(c.start_utc_tz).toISOString() : null,
        endTime:   c.end_utc_tz   ? new Date(c.end_utc_tz).toISOString()   : null,
        duration:  null,
        status:    c.status === "ONGOING" ? "RUNNING" : "UPCOMING",
      })).filter(c => c.startTime);
  } catch (e) {
    logger.warn(`[contests] HackerEarth: ${e.message}`);
    return [];
  }
}

// ── Merge + dedupe + sort ────────────────────────────────────
async function fetchAll() {
  const results = await Promise.allSettled([
    fetchCodeforces(),
    fetchCodeChef(),
    fetchLeetCode(),
    fetchAtCoder(),
    fetchHackerEarth(),
  ]);

  const all = results
    .filter(r => r.status === "fulfilled")
    .flatMap(r => r.value);

  logger.info(`[contests] Fetched: ${all.map(c=>c.platform).reduce((a,p)=>{a[p]=(a[p]||0)+1;return a;},{})||{}}`);

  // Dedupe by name
  const seen = new Set();
  const deduped = all.filter(c => {
    const key = c.name.toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,20);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort: RUNNING first, then by startTime
  deduped.sort((a,b) => {
    if (a.status==="RUNNING" && b.status!=="RUNNING") return -1;
    if (b.status==="RUNNING" && a.status!=="RUNNING") return 1;
    return new Date(a.startTime) - new Date(b.startTime);
  });

  return deduped;
}

router.get("/", async (req, res) => {
  try {
    const now = Date.now();
    if (cache.data.length && now - cache.fetchedAt < CACHE_TTL) {
      return res.json({ success:true, data:cache.data, cached:true });
    }
    const data = await fetchAll();
    cache = { data, fetchedAt: now };
    res.json({ success:true, data, cached:false });
  } catch (err) {
    logger.error(`[contests] ${err.message}`);
    if (cache.data.length) return res.json({ success:true, data:cache.data, cached:true, stale:true });
    res.status(500).json({ success:false, error:"Failed to fetch contests" });
  }
});

module.exports = router;
