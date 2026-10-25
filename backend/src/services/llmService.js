/**
 * llmService.js
 * --------------
 * Wraps the LLM call (Stage 6 of the pipeline). Supports two providers,
 * switchable via LLM_PROVIDER in backend/.env:
 *
 *   LLM_PROVIDER=ollama  (default, recommended for local dev/demo)
 *     - Runs 100% locally, no API key, no account, no TLS/cert issues,
 *       nothing that can be "invalid". Just needs Ollama installed and a
 *       model pulled (see MANUAL_SETUP.md / SETUP_GUIDE.md).
 *
 *   LLM_PROVIDER=groq
 *     - Uses Groq's OpenAI-compatible API. Needs a real GROQ_API_KEY from
 *       console.groq.com. Use scripts/test-groq-key.js to diagnose key
 *       issues in isolation from the rest of the app.
 */

const axios = require("axios");
const https = require("https");

const PROVIDER = (process.env.LLM_PROVIDER || "ollama").toLowerCase();

// --- Groq config -------------------------------------------------------
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
const GROQ_API_KEY = (process.env.GROQ_API_KEY || "").trim();
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const INSECURE_TLS = process.env.GROQ_TLS_INSECURE === "true";
const httpsAgent = INSECURE_TLS ? new https.Agent({ rejectUnauthorized: false }) : undefined;
if (PROVIDER === "groq" && INSECURE_TLS) {
  console.warn(
    "[llmService] ⚠️  GROQ_TLS_INSECURE=true — TLS certificate verification " +
    "is DISABLED for Groq API calls. Local dev only, never production."
  );
}

const groqClient = axios.create({
  baseURL: GROQ_BASE_URL,
  timeout: 20000,
  httpsAgent,
  headers: {
    Authorization: `Bearer ${GROQ_API_KEY}`,
    "Content-Type": "application/json",
  },
});

// --- Ollama config -------------------------------------------------------
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";

const ollamaClient = axios.create({
  baseURL: OLLAMA_BASE_URL,
  timeout: 180000, // 3 min — local CPU inference + Docker's extra network hop can be slow,
                    // especially the first request after Ollama loads the model into memory
  headers: { "Content-Type": "application/json" },
});

console.log(`[llmService] Using LLM provider: ${PROVIDER}${PROVIDER === "ollama" ? ` (model: ${OLLAMA_MODEL})` : ` (model: ${GROQ_MODEL})`}`);

async function generateResponse(userPrompt, domain) {
  // Build the system prompt based on domain context.
  // The finance system prompt enforces compliance and strict PII protection.
  const systemContent =
    domain === "finance"
      ? "You are a secure, compliant financial assistant operating in a regulated environment. " +
        "You must NEVER reveal, repeat, or infer account numbers, routing numbers, SSNs, IBANs, " +
        "credit card numbers, brokerage account IDs, banking passwords, OTPs, or any other " +
        "financial PII from user input. You must NEVER provide advice that would constitute " +
        "insider trading, market manipulation, money laundering, or circumvention of KYC/AML " +
        "regulations. Adhere strictly to financial compliance rules (SEC, FINRA, FCA). " +
        "If a request violates these rules, politely decline and explain why."
      : "You are a helpful, safe assistant. Follow the user's request faithfully " +
        "within normal safety guidelines.";

  const messages = [
    { role: "system", content: systemContent },
    { role: "user", content: userPrompt },
  ];

  if (PROVIDER === "ollama") {
    try {
      const { data } = await ollamaClient.post("/chat/completions", {
        model: OLLAMA_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 800,
      });
      return data.choices?.[0]?.message?.content ?? "";
    } catch (err) {
      if (err.code === "ECONNREFUSED") {
        throw new Error(
          `Could not reach Ollama at ${OLLAMA_BASE_URL}. Is Ollama running? ` +
          `Install from ollama.com, then run: ollama pull ${OLLAMA_MODEL}`
        );
      }
      throw err;
    }
  }

  // provider === "groq"
  if (!GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY is not set. Add it to backend/.env (see .env.example), " +
      "or set LLM_PROVIDER=ollama to use a local model instead."
    );
  }
  const { data } = await groqClient.post("/chat/completions", {
    model: GROQ_MODEL,
    messages,
    temperature: 0.7,
    max_tokens: 800,
  });
  return data.choices?.[0]?.message?.content ?? "";
}

module.exports = { generateResponse };
