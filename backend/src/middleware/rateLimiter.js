const rateLimit = require("express-rate-limit");
const IpBlacklist = require("../models/IpBlacklist");

// --- 1. Fixed-window rate limiter (10 req/min/user, per report §3.3) ------
const fixedWindowLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || "10", 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  handler: (req, res) => {
    recordViolation(req.ip);
    res.status(429).json({
      error: "Rate limit exceeded",
      retryAfter: 60,
      message: "Too many requests. Please wait before sending more prompts.",
    });
  },
});

// --- 2. Sliding-window violation tracker + exponential backoff -----------
// In-memory store: { ip: { violations: [], banUntil: timestamp } }
const violationStore = new Map();

function recordViolation(ip) {
  const now = Date.now();
  const entry = violationStore.get(ip) || { violations: [], banUntil: 0 };
  entry.violations = entry.violations.filter((t) => now - t < 60_000); // 60s sliding window
  entry.violations.push(now);

  if (entry.violations.length >= 3) {
    // 3. Temporary ban after 3+ violations within the window
    const backoffSeconds = Math.min(30, 0.5 * Math.pow(2, entry.violations.length - 3));
    entry.banUntil = now + backoffSeconds * 1000;

    if (entry.violations.length >= 5) {
      // Escalate to a real DB-backed ban (30–60s) + flag for admin review
      IpBlacklist.findOneAndUpdate(
        { ip_address: ip },
        {
          ip_address: ip,
          reason: "5+ rate-limit violations in a 60s window",
          banned_at: new Date(),
          expires_at: new Date(now + 60_000),
        },
        { upsert: true }
      ).catch((e) => console.error("[rateLimiter] Failed to persist ban:", e.message));
    }
  }
  violationStore.set(ip, entry);
}

// --- 4. Exponential-backoff / temp-ban guard, checked before every request
async function banGuard(req, res, next) {
  const ip = req.ip;
  const entry = violationStore.get(ip);
  if (entry && entry.banUntil > Date.now()) {
    const retryAfter = Math.ceil((entry.banUntil - Date.now()) / 1000);
    return res.status(429).json({
      error: "Temporarily banned",
      retryAfter,
      message: `Too many violations. Try again in ${retryAfter}s.`,
    });
  }

  try {
    const dbBan = await IpBlacklist.findOne({ ip_address: ip, expires_at: { $gt: new Date() } });
    if (dbBan) {
      return res.status(403).json({
        error: "IP banned",
        message: "This IP address has been temporarily banned due to repeated violations.",
      });
    }
  } catch (e) {
    // fail-open on DB errors so a Mongo outage doesn't take down the API
    console.error("[banGuard] DB check failed:", e.message);
  }

  next();
}

module.exports = { fixedWindowLimiter, banGuard, recordViolation };
