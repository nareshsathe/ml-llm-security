import { CheckCircle2, AlertTriangle, Ban } from "lucide-react";

export default function RiskBadge({ action, riskScore }) {
  const config = {
    ALLOW: { classes: "bg-safe/10 text-safe border-safe/25", label: "Safe · Allowed", Icon: CheckCircle2 },
    WARN: { classes: "bg-warn/10 text-warn border-warn/25", label: "Suspicious · Warned", Icon: AlertTriangle },
    BLOCK: { classes: "bg-danger/10 text-danger border-danger/25", label: "Blocked", Icon: Ban },
  };
  const { classes, label, Icon } = config[action] || config.ALLOW;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${classes}`}
    >
      <Icon size={12} strokeWidth={2.5} />
      {label}
      <span className="font-mono opacity-70">risk {riskScore?.toFixed(2)}</span>
    </span>
  );
}
