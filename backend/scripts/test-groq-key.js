/**
 * test-groq-key.js
 * -----------------
 * Standalone diagnostic — tests your Groq API key directly, with nothing
 * else (no Express, no ML service, no frontend) in the way. Run this
 * whenever the chat says "Invalid API Key" to find out definitively
 * whether it's the key itself or something else.
 *
 * Run from the backend/ folder:
 *   node scripts/test-groq-key.js
 */

require("dotenv").config();
const https = require("https");

const key = (process.env.GROQ_API_KEY || "").trim();
const baseUrl = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const insecure = process.env.GROQ_TLS_INSECURE === "true";

console.log("=== Groq API Key Diagnostic ===\n");

if (!key) {
  console.log("❌ No GROQ_API_KEY found in backend/.env — nothing to test.");
  process.exit(1);
}

const masked = key.length > 12 ? `${key.slice(0, 8)}...${key.slice(-4)}` : "(too short to mask safely)";
console.log(`Key found:        ${masked}`);
console.log(`Key length:       ${key.length} (Groq keys are typically 56 chars)`);
console.log(`Starts with gsk_: ${key.startsWith("gsk_")}`);
console.log(`Has whitespace:   ${key !== key.trim() ? "YES (this would be a problem, but we already trim it)" : "no"}`);
console.log(`Base URL:         ${baseUrl}`);
console.log(`Model:            ${model}`);
console.log(`TLS insecure:     ${insecure}\n`);

console.log("Sending a real test request to Groq...\n");

const axios = require("axios");
const agent = insecure ? new https.Agent({ rejectUnauthorized: false }) : undefined;

axios
  .post(
    `${baseUrl}/chat/completions`,
    {
      model,
      messages: [{ role: "user", content: "Say 'test successful' and nothing else." }],
      max_tokens: 20,
    },
    {
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      httpsAgent: agent,
      timeout: 15000,
    }
  )
  .then((res) => {
    console.log("✅ SUCCESS — your key works!");
    console.log("Groq responded:", res.data.choices?.[0]?.message?.content);
  })
  .catch((err) => {
    console.log("❌ FAILED\n");
    if (err.response) {
      console.log(`Status: ${err.response.status}`);
      console.log(`Body:   ${JSON.stringify(err.response.data, null, 2)}`);
      if (err.response.status === 401) {
        console.log(
          "\n👉 This confirms it's the key itself, not this codebase. Go to " +
          "console.groq.com, create a brand-new key, and copy it IMMEDIATELY " +
          "from the creation popup (not from the key list afterward — Groq " +
          "only shows the full secret once)."
        );
      }
    } else {
      console.log("Network-level error (no response received):", err.message);
      console.log(
        "\n👉 This suggests a connectivity/TLS/DNS issue, not an invalid key. " +
        "See MANUAL_SETUP.md troubleshooting for TLS certificate fixes."
      );
    }
  });
