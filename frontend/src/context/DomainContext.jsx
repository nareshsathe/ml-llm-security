import { createContext, useContext, useState, useEffect } from "react";

const DomainContext = createContext(null);

const VALID_DOMAINS = ["general", "finance"];
const STORAGE_KEY = "llmguard_domain";

export function DomainProvider({ children }) {
  const [domain, setDomainState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return VALID_DOMAINS.includes(stored) ? stored : "general";
  });

  const setDomain = (d) => {
    if (VALID_DOMAINS.includes(d)) {
      setDomainState(d);
      localStorage.setItem(STORAGE_KEY, d);
    }
  };

  return (
    <DomainContext.Provider value={{ domain, setDomain }}>
      {children}
    </DomainContext.Provider>
  );
}

export function useDomain() {
  const ctx = useContext(DomainContext);
  if (!ctx) throw new Error("useDomain must be used within a DomainProvider");
  return ctx;
}
