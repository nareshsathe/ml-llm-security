import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "llm-security-sessions-v2";

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

const SYSTEM_MESSAGE = {
  role: "system",
  text: "Every prompt you send here passes through the ML guardrail before it ever reaches the LLM. Try a normal question, or try a jailbreak-style prompt to see it get blocked.",
};

function createSession(title = "New Chat") {
  return {
    id: generateId(),
    title,
    messages: [SYSTEM_MESSAGE],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function loadSessions() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return [createSession()];
}

export default function useChatSessions() {
  const [sessions, setSessions] = useState(loadSessions);
  const [activeId, setActiveId] = useState(() => loadSessions()[0]?.id);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch { /* storage full */ }
  }, [sessions]);

  const activeSession = sessions.find((s) => s.id === activeId) ?? sessions[0];

  const newChat = useCallback(() => {
    const s = createSession();
    setSessions((prev) => [s, ...prev]);
    setActiveId(s.id);
  }, []);

  const selectSession = useCallback((id) => setActiveId(id), []);

  const deleteSession = useCallback((id) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (next.length === 0) {
        const fresh = createSession();
        setActiveId(fresh.id);
        return [fresh];
      }
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  }, [activeId]);

  const renameSession = useCallback((id, title) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: title.trim() || "New Chat" } : s))
    );
  }, []);

  const setMessages = useCallback((updater) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeId) return s;
        const msgs = typeof updater === "function" ? updater(s.messages) : updater;
        return { ...s, messages: msgs, updatedAt: Date.now() };
      })
    );
  }, [activeId]);

  const autoTitle = useCallback((text) => {
    const title = text.length > 45 ? text.slice(0, 45) + "..." : text;
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeId && s.title === "New Chat" ? { ...s, title } : s
      )
    );
  }, [activeId]);

  return {
    sessions,
    activeSession,
    activeId,
    messages: activeSession?.messages ?? [SYSTEM_MESSAGE],
    newChat,
    selectSession,
    deleteSession,
    renameSession,
    setMessages,
    autoTitle,
  };
}
