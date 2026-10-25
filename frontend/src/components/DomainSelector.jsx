import { TrendingUp, ShieldCheck } from "lucide-react";
import { useDomain } from "../context/DomainContext";

export default function DomainSelector() {
  const { domain, setDomain } = useDomain();

  return (
    <div className="flex flex-col gap-2 p-3 border-t border-border mt-auto">
      <div className="text-xs font-semibold text-muted uppercase tracking-wider px-1">
        Domain Mode
      </div>
      <div className="flex bg-panel2 rounded-lg p-1 border border-border/50">
        <button
          onClick={() => setDomain("general")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
            domain === "general"
              ? "bg-panel shadow-sm text-ink ring-1 ring-border"
              : "text-muted hover:text-ink hover:bg-panel/50"
          }`}
        >
          <ShieldCheck size={14} className={domain === "general" ? "text-accent" : ""} />
          General
        </button>
        <button
          onClick={() => setDomain("finance")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
            domain === "finance"
              ? "bg-panel shadow-sm text-ink ring-1 ring-border"
              : "text-muted hover:text-ink hover:bg-panel/50"
          }`}
        >
          <TrendingUp size={14} className={domain === "finance" ? "text-green-500" : ""} />
          Finance
        </button>
      </div>
    </div>
  );
}
