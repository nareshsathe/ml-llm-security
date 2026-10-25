import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

const api = axios.create({ baseURL: BACKEND_URL });

export function attachToken(token) {
  if (token) {
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common["Authorization"];
  }
}

export async function checkPrompt(text, domain) {
  const { data } = await api.post("/api/check-prompt", { text, domain });
  return data;
}

export async function checkMultimodal(file, modality, domain) {
  const form = new FormData();
  form.append("file", file);
  if (domain) form.append("domain", domain);
  const { data } = await api.post(`/api/check-multimodal/${modality}`, form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60000, // OCR/transcription genuinely takes longer than plain text
  });
  return data;
}

export async function login(username) {
  const { data } = await api.post("/api/auth/login", { username });
  return data;
}

export async function getSummary(domain) {
  const query = domain ? `?domain=${domain}` : "";
  const { data } = await api.get(`/api/dashboard/summary${query}`);
  return data;
}

export async function getAttackTypes(domain) {
  const query = domain ? `?domain=${domain}` : "";
  const { data } = await api.get(`/api/dashboard/attack-types${query}`);
  return data;
}

export async function getHourlyTrend(domain) {
  const query = domain ? `?domain=${domain}` : "";
  const { data } = await api.get(`/api/dashboard/hourly-trend${query}`);
  return data;
}

export async function getRiskDistribution(domain) {
  const query = domain ? `?domain=${domain}` : "";
  const { data } = await api.get(`/api/dashboard/risk-distribution${query}`);
  return data;
}

export async function getLogs(limit = 50, domain) {
  const query = domain ? `&domain=${domain}` : "";
  const { data } = await api.get(`/api/dashboard/logs?limit=${limit}${query}`);
  return data;
}

export async function getBlacklistCandidates(domain) {
  const query = domain ? `?domain=${domain}` : "";
  const { data } = await api.get(`/api/dashboard/blacklist-candidates${query}`);
  return data;
}

export async function getFinanceSummary() {
  const { data } = await api.get("/api/dashboard/finance-summary");
  return data;
}

export default api;
