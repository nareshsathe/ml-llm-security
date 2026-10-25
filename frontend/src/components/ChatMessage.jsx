import { useState } from "react";
import { Bot, Copy, Check, ShieldAlert, Image, Music, Video, User, TrendingUp } from "lucide-react";
import RiskBadge from "./RiskBadge";

const MODALITY_ICON = { image: Image, audio: Music, video: Video };

export function TypingIndicator({ label }) {
  return (
    <div className="flex items-start gap-3 msg-animate">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent ring-1 ring-accent/20">
        <Bot size={15} />
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-border bg-panel px-4 py-3 h-11">
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
        </div>
        {label && <p className="text-xs text-muted/70 ml-1">{label}</p>}
      </div>
    </div>
  );
}

export default function ChatMessage({ message: m }) {
  const [copied, setCopied] = useState(false);
  const FileIcon = m.fileModality ? MODALITY_ICON[m.fileModality] : null;

  function copyText() {
    navigator.clipboard.writeText(m.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  /* System / info message */
  if (m.role === "system") {
    return (
      <div className="flex justify-center msg-animate">
        <div className="max-w-lg text-center rounded-xl border border-border/60 bg-panel2/40 px-5 py-3 text-sm text-muted/80 italic leading-relaxed">
          {m.text}
        </div>
      </div>
    );
  }

  /* User message */
  if (m.role === "user") {
    return (
      <div className="flex justify-end items-end gap-2.5 msg-animate">
        <div className="max-w-[76%] rounded-2xl rounded-br-sm bg-accent px-4 py-3 text-[15px] leading-relaxed text-white shadow-sm">
          {FileIcon && (
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-white/75">
              <FileIcon size={12} /> {m.fileModality} file
            </div>
          )}
          <div className="whitespace-pre-wrap">{m.text}</div>
        </div>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <User size={13} />
        </div>
      </div>
    );
  }

  /* Assistant message */
  const isError = m.meta?.isSystemError;

  return (
    <div className="flex items-start gap-3 group msg-animate">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ${
        isError
          ? "bg-danger/10 text-danger ring-danger/20"
          : "bg-accent/10 text-accent ring-accent/20"
      }`}>
        {isError ? <ShieldAlert size={15} /> : <Bot size={15} />}
      </div>

      <div className="flex-1 min-w-0">
        <div className={`relative rounded-2xl rounded-tl-sm px-4 py-3 text-[15px] leading-relaxed ${
          isError
            ? "border border-danger/30 bg-danger/5 text-ink"
            : "border border-border bg-panel text-ink shadow-sm"
        }`}>
          {/* Error label */}
          {isError && (
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-danger">
              <ShieldAlert size={13} /> Service Error
            </div>
          )}

          {/* Security metadata */}
          {m.meta && !isError && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <RiskBadge action={m.meta.action} riskScore={m.meta.risk_score} />
              {m.meta.input_modality && m.meta.input_modality !== "text" && (
                <span className="rounded-full border border-border bg-panel2 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                  {m.meta.input_modality}
                </span>
              )}
            </div>
          )}

          {/* Message text */}
          <div className="whitespace-pre-wrap">{m.text}</div>

          {/* Extracted text */}
          {m.meta?.extracted_text && (
            <div className="mt-3 rounded-lg border border-border/60 bg-panel2 px-3 py-2.5">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted/70">
                Extracted text
              </div>
              <div className="font-mono text-xs text-muted leading-relaxed">
                "{m.meta.extracted_text}"
              </div>
            </div>
          )}

          {/* Redactions */}
          {m.meta?.redactions?.length > 0 && (
            <div className="mt-2 text-xs text-muted font-mono">
              Redacted: {m.meta.redactions.map((r) => r.type).join(", ")}
            </div>
          )}

          {/* Domain signals */}
          {m.meta?.domain_features?.fired_signals?.length > 0 && (
            <div className="mt-3 rounded-lg border border-border/60 bg-panel2 px-3 py-2.5">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted/70">
                Domain signals detected
              </div>
              <div className="flex flex-wrap gap-1.5">
                {m.meta.domain_features.fired_signals.map((sig) => (
                  <span
                    key={sig}
                    className="rounded-full border border-danger/25 bg-danger/8 px-2 py-0.5 text-[10px] font-mono text-danger"
                  >
                    {sig}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Finance signals */}
          {m.meta?.finance_signals?.fired_finance_signals?.length > 0 && (
            <div className="mt-3 rounded-lg border border-border/60 bg-panel2 px-3 py-2.5">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted/70 flex items-center gap-1.5">
                <TrendingUp size={11} className="text-green-500" />
                Finance Threat Signals
              </div>
              <div className="flex flex-wrap gap-1.5">
                {m.meta.finance_signals.fired_finance_signals.map((sig) => (
                  <span
                    key={sig}
                    className="rounded-full border border-green-500/25 bg-green-500/10 px-2 py-0.5 text-[10px] font-mono text-green-600 dark:text-green-400"
                  >
                    {sig}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Copy button */}
          {!isError && (
            <button
              onClick={copyText}
              title={copied ? "Copied!" : "Copy message"}
              className="absolute right-2.5 top-2.5 p-1.5 rounded-md text-muted opacity-0 group-hover:opacity-100 hover:bg-panel2 hover:text-ink transition-all duration-150"
            >
              {copied ? (
                <Check size={13} className="text-safe" />
              ) : (
                <Copy size={13} />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
