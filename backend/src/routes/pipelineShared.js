const { filterLlmResponse } = require("../services/mlService");
const { generateResponse } = require("../services/llmService");
const { recordViolation } = require("../middleware/rateLimiter");
const PromptLog = require("../models/PromptLog");

/**
 * Shared by /api/check-prompt and /api/check-multimodal: given a
 * classification result (from either the text or the multimodal ML
 * service endpoints) and the ORIGINAL text used for that classification,
 * runs the rest of the pipeline — LLM call if allowed, response filtering,
 * logging, and the response payload — identically for both entry points.
 */
async function runPostClassificationPipeline({
  classification, promptTextForLLM, req, startTime, extraLogFields = {}, extraResponseFields = {}, domain,
}) {
  const ip = req.ip;
  const userId = req.user?.id || "anonymous";
  const domainValue = domain || "general";

  let llmResponse = null;
  let redactions = [];

  if (classification.action === "BLOCK") {
    recordViolation(ip);
  } else {
    const raw = await generateResponse(promptTextForLLM, domainValue);
    const filtered = await filterLlmResponse(raw, domainValue);
    llmResponse = filtered.filtered_text;
    redactions = filtered.redactions;
  }

  const responseTimeMs = Date.now() - startTime;

  await PromptLog.create({
    user_id: userId,
    ip_address: ip,
    prompt_text: promptTextForLLM,
    label: classification.label,
    attack_type: classification.attack_type,
    attack_type_source: classification.attack_type_source || "n/a",
    risk_score: classification.risk_score,
    action_taken: classification.action,
    response_time_ms: responseTimeMs,
    llm_response_redacted: redactions.length > 0,
    domain: domainValue,
    ...extraLogFields,
  });

  return {
    action: classification.action,
    risk_score: classification.risk_score,
    attack_type: classification.attack_type,
    attack_type_source: classification.attack_type_source || "n/a",
    domain_features: classification.domain_features || null,
    finance_signals: classification.finance_signals || null,
    domain: domainValue,
    llm_response: llmResponse,
    redactions,
    response_time_ms: responseTimeMs,
    message:
      classification.action === "BLOCK"
        ? "This prompt was blocked by the security guardrail."
        : classification.action === "WARN"
        ? "This prompt looked suspicious but was allowed. Response may be filtered."
        : "Prompt allowed.",
    ...extraResponseFields,
  };
}

/**
 * Shared error handler — identical diagnostic logic (ML service vs LLM
 * provider vs database) used by both routes, so multimodal requests get
 * the same clear, specific error messages the text route already has.
 */
function handlePipelineError(err, res) {
  console.error("[pipeline] Error:", err.message);

  if (err.isAxiosError && err.config?.baseURL?.includes("8000")) {
    const detail = err.response?.data?.detail;
    return res.status(503).json({
      error: "ML service unavailable",
      message: detail
        ? `ML service error: ${detail}`
        : `Could not reach the ML classification service: ${err.message}`,
    });
  }
  if (err.isAxiosError) {
    const providerName = (process.env.LLM_PROVIDER || "ollama").toLowerCase() === "groq" ? "Groq" : "Ollama";
    const upstreamStatus = err.response?.status;
    const upstreamDetail = err.response?.data
      ? JSON.stringify(err.response.data).slice(0, 300)
      : err.message;

    const isCertError = err.code === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY" ||
      /unable to get local issuer certificate/i.test(err.message);
    if (isCertError) {
      return res.status(502).json({
        error: "LLM provider error",
        message:
          `TLS certificate verification failed reaching ${providerName}. This is usually ` +
          "an outdated Node.js install or an incorrect system clock, not an " +
          "API key problem — see the Troubleshooting section in SETUP.md for the fix. " +
          "Or switch LLM_PROVIDER=ollama in backend/.env to avoid the internet entirely.",
      });
    }

    const isTimeout = err.code === "ECONNABORTED" || /timeout of \d+ms exceeded/i.test(err.message);
    if (isTimeout && providerName === "Ollama") {
      return res.status(504).json({
        error: "LLM provider error",
        message:
          "Ollama took too long to respond. This is a hardware/model-size issue, not a " +
          "connectivity bug — the connection to Ollama worked, it just didn't finish in time. " +
          "Try: (1) run `ollama run llama3.2 \"hello\"` directly in a terminal to see how long " +
          "a response actually takes on this machine, (2) close other heavy applications to " +
          "free up RAM/CPU, or (3) switch to a smaller model — `ollama pull llama3.2:1b` and " +
          "set OLLAMA_MODEL=llama3.2:1b in backend/.env — which runs noticeably faster on " +
          "limited hardware.",
      });
    }

    return res.status(502).json({
      error: "LLM provider error",
      message: `${providerName} API call failed${upstreamStatus ? ` (status ${upstreamStatus})` : ""}: ${upstreamDetail}`,
    });
  }
  if (err.name === "MongooseError" || err.name === "MongoServerError" || err.name === "ValidationError") {
    return res.status(500).json({
      error: "Database error",
      message: `MongoDB operation failed: ${err.message}. Is MongoDB running and MONGO_URI correct?`,
    });
  }

  return res.status(500).json({
    error: "Internal server error",
    message: err.message,
  });
}

module.exports = { runPostClassificationPipeline, handlePipelineError };
