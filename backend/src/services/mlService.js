const axios = require("axios");
const FormData = require("form-data");

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://ml-service:8000";

// 15s, not 5s: classification is normally sub-second once the model is
// warm, but on real hardware (antivirus scanning, first-connection TCP
// overhead, general Windows overhead vs. a dev sandbox) 5s was too tight
// and caused false timeouts even when the ML service was working fine.
const client = axios.create({ baseURL: ML_SERVICE_URL, timeout: 15000 });

// Multimodal calls get their own client with a longer timeout — OCR/frame
// sampling/transcription genuinely take longer than a plain text classify.
const multimodalClient = axios.create({ baseURL: ML_SERVICE_URL, timeout: 45000 });

async function classifyPrompt(text, domain) {
  const { data } = await client.post("/classify", { text, domain: domain || null });
  return data; // { label, risk_score, action, attack_type, finance_signals? }
}

async function classifyMultimodal(fileBuffer, filename, mimetype, modality) {
  // modality: "image" | "audio" | "video"
  const form = new FormData();
  form.append("file", fileBuffer, { filename, contentType: mimetype });
  const { data } = await multimodalClient.post(`/classify/${modality}`, form, {
    headers: form.getHeaders(),
  });
  return data; // { label, risk_score, action, attack_type, extracted_text, ... }
}

async function filterLlmResponse(text, domain) {
  const { data } = await client.post("/filter", { text, domain: domain || null });
  return data; // { filtered_text, redactions }
}

async function checkHealth() {
  try {
    const { data } = await axios.get(`${ML_SERVICE_URL}/health`, { timeout: 4000 });
    return data;
  } catch (e) {
    return { status: "unreachable", model_loaded: false };
  }
}

module.exports = { classifyPrompt, classifyMultimodal, filterLlmResponse, checkHealth };
