import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTeams } from "../../api/hooks";
import { useSocketInvalidate } from "../../hooks/useSocketInvalidate";
import { poolLabel } from "../../utils/stage";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function TeamsList() {
  const { data: teams, isLoading } = useTeams();
  const [search, setSearch] = useState("");

  useSocketInvalidate(["team:updated"], [["teams"]]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teams ?? [];
    return (teams ?? []).filter(
      (t) => t.name.toLowerCase().includes(q) || t.player1_name.toLowerCase().includes(q) || t.player2_name.toLowerCase().includes(q)
    );
  }, [teams, search]);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl sm:text-3xl text-slate-800">Teams</h1>
        <p className="text-slate-400 text-sm mt-1">{teams?.length ?? 0} teams registered</p>
      </div>

      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4-4" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          placeholder="Search by team or player name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-96 pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
        />
      </div>

      {isLoading && <p className="text-sm text-slate-400">Loading teams…</p>}

      <div className="grid sm:grid-cols-2 gap-3">
        {filtered.map((t) => (
          <Link key={t.id} to={`/teams/${t.id}`} className="roster-card hover:shadow-md transition-shadow">
            <span
              className="avatar"
              style={{ width: 48, height: 48, fontSize: "1rem", background: "linear-gradient(135deg,var(--pb-teal-600),var(--pb-teal-800))" }}
            >
              {initials(t.name)}
            </span>
            <div className="flex-1">
              <p className="font-bold text-slate-800 text-sm">{t.name}</p>
              <p className="text-xs text-slate-400">
                {t.player1_name} &amp; {t.player2_name}
                {t.pool_label ? ` · ${poolLabel(t.pool_label)}` : ""}
              </p>
              <p className="text-xs text-teal-700 font-semibold mt-0.5">
                {t.wins}&ndash;{t.losses} this tournament
              </p>
            </div>
          </Link>
        ))}
      </div>

      {!isLoading && filtered.length === 0 && <p className="text-sm text-slate-400">No teams found.</p>}
    </main>
  );
}
