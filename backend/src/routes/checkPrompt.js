const express = require("express");
const { classifyPrompt } = require("../services/mlService");
const { runPostClassificationPipeline, handlePipelineError } = require("./pipelineShared");

const router = express.Router();

// POST /api/check-prompt
router.post("/", async (req, res) => {
  const startTime = Date.now();
  const { text, domain } = req.body;

  if (!text || typeof text !== "string" || text.length === 0) {
    return res.status(400).json({ error: "`text` field is required" });
  }
  if (text.length > 2000) {
    return res.status(400).json({ error: "Prompt exceeds max length of 2000 characters" });
  }
  // Validate domain if provided
  const validDomains = ["general", "finance"];
  const resolvedDomain = validDomains.includes(domain) ? domain : "general";

  try {
    const classification = await classifyPrompt(text, resolvedDomain);
    const payload = await runPostClassificationPipeline({
      classification, promptTextForLLM: text, req, startTime, domain: resolvedDomain,
    });
    return res.json(payload);
  } catch (err) {
    return handlePipelineError(err, res);
  }
});

module.exports = router;
