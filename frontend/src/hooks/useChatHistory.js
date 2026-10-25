import { useEffect, useState } from "react";

const STORAGE_KEY = "llm-security-chat-history";

const DEFAULT_MESSAGES = [
  {
    role: "system",
    text: "Every prompt you send here passes through the ML guardrail before it ever reaches the LLM. Try a normal question, or try a jailbreak-style prompt to see it get blocked.",
  },
];

function loadInitial() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // corrupted storage — fall back to defaults rather than crash
  }
  return DEFAULT_MESSAGES;
}

export default function useChatHistory() {
  const [messages, setMessages] = useState(loadInitial);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // storage full/unavailable — chat still works for this session, just won't persist
    }
  }, [messages]);

  function clearHistory() {
    setMessages(DEFAULT_MESSAGES);
  }

  return { messages, setMessages, clearHistory };
}
