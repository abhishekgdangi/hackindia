/**
 * agents/validationAgent.js
 *
 * Checks every scraped hackathon for:
 *   1. Required fields (name, applyLink, registrationDeadline)
 *   2. Deadline not in the past
 *   3. Apply link is reachable (HTTP HEAD / GET)
 *   4. Duplicate detection (same externalId or fuzzy name match)
 */

const axios     = require("axios");
const Hackathon = require("../models/Hackathon");
const AgentLog  = require("../models/AgentLog");
const logger    = require("../utils/logger");

const LINK_TIMEOUT = 8000;

/* ── Link check ──────────────────────────────────────────────────── */

async function checkLink(url) {
  if (!url || !url.startsWith("http")) return { alive: false, status: 0 };

  const headers = {
    "User-Agent": "Mozilla/5.0 (compatible; HackIndiaBot/1.0; +https://hackindia.dev)",
  };

  try {
    const res = await axios.head(url, { timeout: LINK_TIMEOUT, maxRedirects: 5, headers });
    return { alive: res.status < 400, status: res.status };
  } catch {
    // Some servers reject HEAD → try GET (stream only, don't download body)
    try {
      const res = await axios.get(url, {
        timeout: LINK_TIMEOUT,
        maxRedirects: 5,
        responseType: "stream",
        headers,
      });
      res.data.destroy();
      return { alive: res.status < 400, status: res.status };
    } catch (e2) {
      return { alive: false, status: e2.response?.status || 0 };
    }
  }
}

/* ── Levenshtein similarity 0–1 ──────────────────────────────────── */

function similarity(a = "", b = "") {
  a = a.toLowerCase().trim();
  b = b.toLowerCase().trim();
  if (a === b) return 1;
  const la = a.length, lb = b.length;
  if (!la || !lb) return 0;
  const dp = Array.from({ length: la + 1 }, (_, i) =>
    Array.from({ length: lb + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= la; i++)
    for (let j = 1; j <= lb; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return 1 - dp[la][lb] / Math.max(la, lb);
}

/* ── Validate a single hackathon ─────────────────────────────────── */

async function validateOne(h, existing = []) {
  const errors = [];

  // Required fields
  if (!h.name?.trim())        errors.push("missing_name");
  if (!h.applyLink?.trim())   errors.push("missing_applyLink");
  if (!h.registrationDeadline) errors.push("missing_deadline");

  // Deadline check
  if (h.registrationDeadline && new Date(h.registrationDeadline) < new Date()) {
    errors.push("deadline_passed");
  }

  // Link check
  let linkBroken = false;
  if (h.applyLink && !errors.includes("missing_applyLink")) {
    const { alive } = await checkLink(h.applyLink);
    if (!alive) {
      linkBroken = true;
      errors.push("broken_link");
    }
  }

  // Duplicate check
  let isDuplicate = false;
  for (const ex of existing) {
    // Exact externalId match on same platform
    if (
      h.externalId &&
      ex.externalId === h.externalId &&
      ex.sourcePlatform === h.sourcePlatform
    ) {
      isDuplicate = true;
      break;
    }
    // Fuzzy name match > 90%
    if (similarity(h.name || "", ex.name || "") > 0.9) {
      isDuplicate = true;
      break;
    }
  }
  if (isDuplicate) errors.push("duplicate");

  return {
    ...h,
    linkBroken,
    isDuplicate,
    isValid:          errors.length === 0,
    validationErrors: errors,
    lastValidatedAt:  new Date(),
  };
}

/* ── Validate a full batch ───────────────────────────────────────── */

async function validateBatch(rawHackathons) {
  const start = Date.now();

  // Fetch existing names for dupe detection
  const existing = await Hackathon
    .find({ isActive: true })
    .select("name externalId sourcePlatform")
    .lean();

  const results    = [];
  const CONCURRENT = 10;

  for (let i = 0; i < rawHackathons.length; i += CONCURRENT) {
    const batch   = rawHackathons.slice(i, i + CONCURRENT);
    const settled = await Promise.allSettled(
      batch.map((h) => validateOne(h, existing))
    );
    for (const r of settled) {
      if (r.status === "fulfilled") results.push(r.value);
    }
    logger.info(
      `[ValidationAgent] Validated ${Math.min(i + CONCURRENT, rawHackathons.length)}/${rawHackathons.length}`
    );
  }

  const valid   = results.filter((r) => r.isValid);
  const broken  = results.filter((r) => r.linkBroken).length;
  const dupes   = results.filter((r) => r.isDuplicate).length;
  const expired = results.filter((r) => r.validationErrors?.includes("deadline_passed")).length;

  logger.info(
    `[ValidationAgent] Valid: ${valid.length}/${results.length} | ` +
    `Broken links: ${broken} | Dupes: ${dupes} | Expired: ${expired}`
  );

  // Write log
  await AgentLog.create({
    agent:          "ValidationAgent",
    action:         "validate_batch",
    status:         "success",
    itemsProcessed: rawHackathons.length,
    itemsAdded:     valid.length,
    itemsRemoved:   results.length - valid.length,
    durationMs:     Date.now() - start,
    message:        `Validated ${rawHackathons.length} items. Valid: ${valid.length}`,
  }).catch(() => {});

  return results;
}

/* ── Mark expired hackathons CLOSED ─────────────────────────────── */

async function expireClosedHackathons() {
  const now    = new Date();
  const result = await Hackathon.updateMany(
    {
      isActive: true,
      status:   { $ne: "CLOSED" },
      $or: [
        { registrationDeadline: { $lt: now } },
        { endDate:               { $lt: now } },
      ],
    },
    {
      $set: {
        status:           "CLOSED",
        isActive:         false,
        registrationOpen: false,
      },
    }
  );

  if (result.modifiedCount > 0) {
    logger.info(`[ValidationAgent] Expired ${result.modifiedCount} hackathons`);
  }
  return result.modifiedCount;
}

module.exports = { validateBatch, validateOne, expireClosedHackathons };
