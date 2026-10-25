import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Plus, Search, MessageSquare, Pencil, Trash2,
  BarChart3, Sun, Moon, ShieldCheck, X,
} from "lucide-react";
import DomainSelector from "./DomainSelector";

function groupByDate(sessions) {
  const now = Date.now();
  const day = 86400000;
  const groups = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Last 7 Days", items: [] },
    { label: "Last 30 Days", items: [] },
    { label: "Older", items: [] },
  ];
  sessions.forEach((s) => {
    const age = now - s.updatedAt;
    if (age < day) groups[0].items.push(s);
    else if (age < 2 * day) groups[1].items.push(s);
    else if (age < 7 * day) groups[2].items.push(s);
    else if (age < 30 * day) groups[3].items.push(s);
    else groups[4].items.push(s);
  });
  return groups.filter((g) => g.items.length > 0);
}

function SessionItem({ session, isActive, onSelect, onDelete, onRename }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(session.title);
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setTitle(session.title); }, [session.title]);

  function commitRename() {
    setEditing(false);
    onRename(session.id, title);
  }

  return (
    <div
      className={`group relative flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer select-none transition-all duration-150 ${
        isActive ? "bg-panel2 text-ink" : "text-muted hover:bg-panel2/70 hover:text-ink"
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => !editing && onSelect(session.id)}
    >
      <MessageSquare size={13} className="shrink-0 opacity-50" />
      {editing ? (
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") { setTitle(session.title); setEditing(false); }
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 bg-transparent text-sm text-ink outline-none min-w-0"
        />
      ) : (
        <span className="flex-1 truncate text-sm leading-tight">{session.title}</span>
      )}
      {(hovered || isActive) && !editing && (
        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setEditing(true)}
            className="p-1 rounded text-muted hover:text-ink hover:bg-border/60 transition"
            title="Rename"
          >
            <Pencil size={11} />
          </button>
          <button
            onClick={() => onDelete(session.id)}
            className="p-1 rounded text-muted hover:text-danger hover:bg-danger/10 transition"
            title="Delete"
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function Sidebar({
  sessions, activeId, onNewChat, onSelect, onDelete, onRename,
  theme, onToggleTheme, isOpen, onToggle,
}) {
  const [search, setSearch] = useState("");
  const location = useLocation();

  const filtered = search.trim()
    ? sessions.filter((s) => s.title.toLowerCase().includes(search.toLowerCase()))
    : sessions;
  const groups = groupByDate(filtered);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden backdrop-blur-sm"
          onClick={onToggle}
        />
      )}

      <aside
        className={`
          fixed lg:relative inset-y-0 left-0 z-40 lg:z-auto
          flex flex-col bg-panel border-r border-border
          transition-all duration-300 ease-in-out shrink-0
          ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          w-[260px] h-full overflow-hidden
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent/30 to-accent/10 text-accent ring-1 ring-accent/20">
              <ShieldCheck size={15} strokeWidth={2.25} />
            </div>
            <span className="font-bold text-sm tracking-tight text-ink">LLM Guard</span>
          </div>
          <button
            onClick={onToggle}
            className="lg:hidden p-1.5 rounded-lg text-muted hover:text-ink hover:bg-panel2 transition"
          >
            <X size={15} />
          </button>
        </div>

        {/* New Chat */}
        <div className="px-3 pb-3">
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-3 rounded-xl border border-dashed border-border px-3 py-2.5 text-sm text-muted hover:text-ink hover:border-accent/50 hover:bg-accent/5 transition-all duration-200 group"
          >
            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-accent/10 text-accent transition-all group-hover:bg-accent group-hover:text-white">
              <Plus size={13} />
            </div>
            <span className="font-medium">New chat</span>
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-base/60 px-3 py-2 focus-within:border-accent/40 transition">
            <Search size={12} className="text-muted shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats..."
              className="flex-1 bg-transparent text-xs text-ink placeholder:text-muted/70 outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-muted hover:text-ink">
                <X size={11} />
              </button>
            )}
          </div>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-2 sidebar-scroll">
          {groups.length === 0 ? (
            <div className="px-3 py-8 text-xs text-muted text-center">
              {search ? "No matching chats" : "No conversations yet"}
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label} className="mb-1">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted/50">
                  {group.label}
                </div>
                {group.items.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    isActive={session.id === activeId}
                    onSelect={onSelect}
                    onDelete={onDelete}
                    onRename={onRename}
                  />
                ))}
              </div>
            ))
          )}
        </div>

        {/* Footer nav */}
        <div className="border-t border-border px-3 py-3 space-y-0.5">
          <Link
            to="/dashboard"
            onClick={() => window.innerWidth < 1024 && onToggle()}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-150 ${
              location.pathname === "/dashboard"
                ? "bg-panel2 text-ink font-medium"
                : "text-muted hover:bg-panel2 hover:text-ink"
            }`}
          >
            <BarChart3 size={14} />
            Dashboard
          </Link>
          <button
            onClick={onToggleTheme}
            className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted hover:bg-panel2 hover:text-ink transition-all duration-150"
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </div>
        <DomainSelector />
      </aside>
    </>
  );
}
