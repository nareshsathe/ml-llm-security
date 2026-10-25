const express = require("express");
const PromptLog = require("../models/PromptLog");
const IpBlacklist = require("../models/IpBlacklist");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

// GET /api/dashboard/summary
router.get("/summary", asyncHandler(async (req, res) => {
  const domainFilter = req.query.domain ? { domain: req.query.domain } : {};
  const [total, safe, malicious, blocked] = await Promise.all([
    PromptLog.countDocuments(domainFilter),
    PromptLog.countDocuments({ ...domainFilter, label: "safe" }),
    PromptLog.countDocuments({ ...domainFilter, label: "malicious" }),
    PromptLog.countDocuments({ ...domainFilter, action_taken: "BLOCK" }),
  ]);
  res.json({ total, safe, malicious, blocked });
}));

// GET /api/dashboard/attack-types  (mirrors report Listing 5.1)
router.get("/attack-types", asyncHandler(async (req, res) => {
  const domainFilter = req.query.domain ? { domain: req.query.domain } : {};
  const results = await PromptLog.aggregate([
    { $match: { label: "malicious", ...domainFilter } },
    {
      $group: {
        _id: "$attack_type",
        count: { $sum: 1 },
        avg_risk: { $avg: "$risk_score" },
      },
    },
    { $sort: { count: -1 } },
  ]);
  res.json(results);
}));

// GET /api/dashboard/hourly-trend
router.get("/hourly-trend", asyncHandler(async (req, res) => {
  const domainFilter = req.query.domain ? { domain: req.query.domain } : {};
  const results = await PromptLog.aggregate([
    { $match: domainFilter },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d %H:00", date: "$created_at" } },
        count: { $sum: 1 },
        malicious: {
          $sum: { $cond: [{ $eq: ["$label", "malicious"] }, 1, 0] },
        },
      },
    },
    { $sort: { _id: 1 } },
    { $limit: 48 },
  ]);
  res.json(results);
}));

// GET /api/dashboard/risk-distribution  (mirrors report Listing 5.3)
router.get("/risk-distribution", asyncHandler(async (req, res) => {
  const domainFilter = req.query.domain ? { domain: req.query.domain } : {};
  const results = await PromptLog.aggregate([
    { $match: domainFilter },
    {
      $bucket: {
        groupBy: "$risk_score",
        boundaries: [0, 0.2, 0.4, 0.6, 0.8, 1.01],
        default: "other",
        output: { count: { $sum: 1 } },
      },
    },
  ]);
  res.json(results);
}));

// GET /api/dashboard/logs?limit=50&domain=finance
router.get("/logs", asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
  const domainFilter = req.query.domain ? { domain: req.query.domain } : {};
  const logs = await PromptLog.find(domainFilter).sort({ created_at: -1 }).limit(limit);
  res.json(logs);
}));

// GET /api/dashboard/blacklist-candidates  (mirrors report Listing 5.2)
router.get("/blacklist-candidates", asyncHandler(async (req, res) => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const domainFilter = req.query.domain ? { domain: req.query.domain } : {};
  const results = await PromptLog.aggregate([
    { $match: { label: "malicious", created_at: { $gte: oneHourAgo }, ...domainFilter } },
    {
      $group: {
        _id: "$ip_address",
        violations: { $sum: 1 },
        max_risk: { $max: "$risk_score" },
        last_attack: { $max: "$created_at" },
      },
    },
    { $match: { violations: { $gte: 5 } } },
    { $sort: { violations: -1 } },
  ]);
  res.json(results);
}));

// GET /api/dashboard/finance-summary — Finance domain specific statistics
router.get("/finance-summary", asyncHandler(async (req, res) => {
  const financeFilter = { domain: "finance" };
  const [total, blocked, warned, avgRiskAgg, topAttacks] = await Promise.all([
    PromptLog.countDocuments(financeFilter),
    PromptLog.countDocuments({ ...financeFilter, action_taken: "BLOCK" }),
    PromptLog.countDocuments({ ...financeFilter, action_taken: "WARN" }),
    PromptLog.aggregate([
      { $match: { ...financeFilter, label: "malicious" } },
      { $group: { _id: null, avg: { $avg: "$risk_score" } } },
    ]),
    PromptLog.aggregate([
      { $match: { ...financeFilter, label: "malicious" } },
      { $group: { _id: "$attack_type", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]),
  ]);
  res.json({
    total_finance_prompts: total,
    blocked_in_finance: blocked,
    warned_in_finance: warned,
    avg_risk_score_malicious: avgRiskAgg[0]?.avg?.toFixed(3) || "0.000",
    top_finance_attack_types: topAttacks.map((a) => ({ type: a._id, count: a.count })),
  });
}));

// GET /api/dashboard/ip-blacklist
router.get("/ip-blacklist", asyncHandler(async (req, res) => {
  const list = await IpBlacklist.find().sort({ banned_at: -1 });
  res.json(list);
}));

// Route-local error handler: a DB timeout here should return a clear 503
// to the dashboard, never crash the server.
router.use((err, req, res, next) => {
  console.error("[dashboard] Error:", err.message);
  res.status(503).json({
    error: "Dashboard data unavailable",
    message: `Database query failed: ${err.message}. Is MongoDB running?`,
  });
});

module.exports = router;
