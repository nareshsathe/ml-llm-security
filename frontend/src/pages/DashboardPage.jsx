import { useEffect, useState } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { ShieldCheck, ShieldX, ShieldAlert, Activity, Menu, BarChart3 } from "lucide-react";
import {
  getSummary, getAttackTypes, getHourlyTrend, getRiskDistribution,
  getLogs, getBlacklistCandidates, getFinanceSummary,
} from "../api";

const PALETTES = {
  dark: {
    grid: "#1E2430",
    axis: "#8A93A6",
    tooltipBg: "#11151E",
    tooltipBorder: "#1E2430",
    series: ["#EF4444", "#F59E0B", "#3B82F6", "#22C55E", "#A78BFA"],
  },
  light: {
    grid: "#E6E8ED",
    axis: "#64748B",
    tooltipBg: "#FFFFFF",
    tooltipBorder: "#E2E6ED",
    series: ["#DC2626", "#B45F06", "#2563EB", "#15803D", "#7C3AED"],
  },
};

function StatCard({ label, value, tone, Icon }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
        {Icon && <Icon size={15} className={tone || "text-muted"} strokeWidth={2.25} />}
      </div>
      <div className={`mt-2 font-mono text-2xl font-semibold ${tone || "text-ink"}`}>{value}</div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4 shadow-card">
      <h2 className="mb-4 text-sm font-semibold text-ink">{title}</h2>
      {children}
    </div>
  );
}

export default function DashboardPage({ theme = "dark", onSidebarToggle }) {
  const palette = PALETTES[theme] || PALETTES.dark;

  const [activeTab, setActiveTab] = useState("all"); // "all" | "general" | "finance"
  const [summary, setSummary] = useState(null);
  const [attackTypes, setAttackTypes] = useState([]);
  const [hourly, setHourly] = useState([]);
  const [riskDist, setRiskDist] = useState([]);
  const [logs, setLogs] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [financeStats, setFinanceStats] = useState(null);
  const [error, setError] = useState(null);

  async function loadAll() {
    try {
      const domainFilter = activeTab === "all" ? undefined : activeTab;
      const [s, a, h, r, l, c] = await Promise.all([
        getSummary(domainFilter), getAttackTypes(domainFilter), getHourlyTrend(domainFilter),
        getRiskDistribution(domainFilter), getLogs(50, domainFilter), getBlacklistCandidates(domainFilter),
      ]);
      setSummary(s);
      setAttackTypes(a.map((x) => ({ name: x._id || "Unclassified", value: x.count })));
      setHourly(h.map((x) => ({ time: x._id, total: x.count, malicious: x.malicious })));
      setRiskDist(r.map((x) => ({ band: String(x._id), count: x.count })));
      setLogs(l);
      setCandidates(c);

      if (activeTab === "finance") {
        setFinanceStats(await getFinanceSummary());
      } else {
        setFinanceStats(null);
      }

      setError(null);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  }

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const tooltipStyle = {
    background: palette.tooltipBg,
    border: `1px solid ${palette.tooltipBorder}`,
    borderRadius: 8,
    fontSize: 12.5,
    fontFamily: "Inter, sans-serif",
  };

  return (
    <div className="flex flex-col h-full bg-base theme-transition overflow-y-auto">
      {/* Mobile top bar */}
      <div className="flex lg:hidden items-center gap-3 border-b border-border bg-panel/80 backdrop-blur px-4 py-3 shrink-0">
        <button
          onClick={onSidebarToggle}
          className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-panel2 transition"
          aria-label="Open sidebar"
        >
          <Menu size={18} />
        </button>
        <div className="flex items-center gap-2">
          <BarChart3 size={15} className="text-accent" />
          <span className="font-bold text-sm text-ink">Dashboard</span>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-ink">Security Dashboard</h1>
        
        <div className="flex items-center gap-4">
          <div className="flex rounded-lg bg-panel2 p-1 border border-border/50">
            {["all", "general", "finance"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all duration-200 capitalize ${
                  activeTab === tab
                    ? "bg-panel shadow-sm text-ink ring-1 ring-border"
                    : "text-muted hover:text-ink hover:bg-panel/50"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <span className="flex items-center gap-1.5 font-mono text-xs text-muted">
            <Activity size={13} className="text-safe" />
            live · refreshes every 10s
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/8 px-4 py-2.5 text-sm text-danger">
          Couldn't load dashboard data: {error}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Prompts" value={summary?.total ?? "—"} Icon={Activity} />
        <StatCard label="Safe" value={summary?.safe ?? "—"} tone="text-safe" Icon={ShieldCheck} />
        <StatCard label="Malicious" value={summary?.malicious ?? "—"} tone="text-danger" Icon={ShieldAlert} />
        <StatCard label="Blocked" value={summary?.blocked ?? "—"} tone="text-warn" Icon={ShieldX} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard title="Attack Type Breakdown">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={attackTypes} dataKey="value" nameKey="name" outerRadius={90} innerRadius={52} paddingAngle={2}>
                {attackTypes.map((_, i) => (
                  <Cell key={i} fill={palette.series[i % palette.series.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12.5, fontFamily: "Inter, sans-serif" }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Risk Score Distribution">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={riskDist}>
              <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} />
              <XAxis dataKey="band" stroke={palette.axis} fontSize={11.5} tickLine={false} />
              <YAxis stroke={palette.axis} fontSize={11.5} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: palette.grid, opacity: 0.4 }} />
              <Bar dataKey="count" fill={palette.series[2]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {financeStats && (
        <div className="mt-6 rounded-xl border border-border bg-panel p-4 shadow-card">
          <h2 className="mb-4 text-sm font-semibold text-ink">Finance Domain Highlights</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="p-3 bg-panel2 rounded-lg border border-border">
              <div className="text-xs text-muted mb-1">Avg Malicious Risk</div>
              <div className="text-xl font-mono text-danger">{financeStats.avg_risk_score_malicious}</div>
            </div>
            <div className="p-3 bg-panel2 rounded-lg border border-border">
              <div className="text-xs text-muted mb-1">Total Prompts</div>
              <div className="text-xl font-mono">{financeStats.total_finance_prompts}</div>
            </div>
            <div className="p-3 bg-panel2 rounded-lg border border-border">
              <div className="text-xs text-muted mb-1">Blocked</div>
              <div className="text-xl font-mono text-danger">{financeStats.blocked_in_finance}</div>
            </div>
            <div className="p-3 bg-panel2 rounded-lg border border-border">
              <div className="text-xs text-muted mb-1">Warned</div>
              <div className="text-xl font-mono text-warn">{financeStats.warned_in_finance}</div>
            </div>
          </div>
          
          {financeStats.top_finance_attack_types.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase text-muted mb-2">Top Finance Threats</h3>
              <div className="flex flex-wrap gap-2">
                {financeStats.top_finance_attack_types.map((atk) => (
                  <div key={atk.type} className="flex items-center gap-2 bg-panel2 border border-border rounded px-3 py-1.5 text-sm">
                    <span className="text-ink">{atk.type}</span>
                    <span className="font-mono text-muted text-xs bg-panel px-1.5 rounded">{atk.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <ChartCard title="Hourly Attack Volume">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={hourly}>
            <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} />
            <XAxis dataKey="time" stroke={palette.axis} fontSize={11} tickLine={false} />
            <YAxis stroke={palette.axis} fontSize={11.5} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12.5, fontFamily: "Inter, sans-serif" }} />
            <Line type="monotone" dataKey="total" stroke={palette.series[2]} strokeWidth={2} dot={false} name="Total" />
            <Line type="monotone" dataKey="malicious" stroke={palette.series[0]} strokeWidth={2} dot={false} name="Malicious" />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="mt-6 rounded-xl border border-border bg-panel p-4 shadow-card">
        <h2 className="mb-4 text-sm font-semibold text-ink">
          IP Blacklist Recommendations <span className="font-normal text-muted">(5+ violations in last hour)</span>
        </h2>
        {candidates.length === 0 ? (
          <p className="text-sm text-muted">No IPs currently meet the blacklist threshold.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="pb-2 font-medium">IP Address</th>
                <th className="pb-2 font-medium">Violations</th>
                <th className="pb-2 font-medium">Max Risk</th>
                <th className="pb-2 font-medium">Last Attack</th>
              </tr>
            </thead>
            <tbody className="font-mono text-[13px]">
              {candidates.map((c) => (
                <tr key={c._id} className="border-t border-border">
                  <td className="py-2.5">{c._id}</td>
                  <td className="py-2.5 text-danger">{c.violations}</td>
                  <td className="py-2.5">{c.max_risk?.toFixed(2)}</td>
                  <td className="py-2.5 text-muted">{new Date(c.last_attack).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-border bg-panel p-4 shadow-card">
        <h2 className="mb-4 text-sm font-semibold text-ink">Recent Prompt Logs</h2>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-panel text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="pb-2 font-medium">Time</th>
                <th className="pb-2 font-medium">Prompt</th>
                <th className="pb-2 font-medium">Label</th>
                <th className="pb-2 font-medium">Attack Type</th>
                <th className="pb-2 font-medium">Risk</th>
                <th className="pb-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l._id} className="border-t border-border">
                  <td className="py-2.5 font-mono text-xs text-muted">{new Date(l.created_at).toLocaleTimeString()}</td>
                  <td className="max-w-xs truncate py-2.5" title={l.prompt_text}>{l.prompt_text}</td>
                  <td className={`py-2.5 font-medium ${l.label === "malicious" ? "text-danger" : "text-safe"}`}>{l.label}</td>
                  <td className="py-2.5 text-muted">{l.attack_type}</td>
                  <td className="py-2.5 font-mono">{l.risk_score?.toFixed(2)}</td>
                  <td className="py-2.5">
                    <span
                      className={`font-medium ${
                        l.action_taken === "BLOCK" ? "text-danger" : l.action_taken === "WARN" ? "text-warn" : "text-safe"
                      }`}
                    >
                      {l.action_taken}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
}
