import { useMemo, useState } from "react";
import { useMatches } from "../../api/hooks";
import { useSocketInvalidate } from "../../hooks/useSocketInvalidate";
import { MatchCard } from "../../components/public/MatchCard";
import type { Match, MatchStatus } from "../../types";

type FilterStatus = "all" | "live" | "upcoming" | "completed";

const FILTERS: { key: FilterStatus; label: string }[] = [
  { key: "all", label: "All Status" },
  { key: "live", label: "Live" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
];

function groupLabel(match: Match): string {
  const time = match.scheduled_time
    ? new Date(match.scheduled_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "Unscheduled";
  if (match.status === "live") return `${time} — In Progress`;
  if (match.status === "completed" || match.status === "forfeited") return `${time} — Completed`;
  if (match.status === "delayed") return `${time} — Delayed`;
  return time;
}

export default function Matches() {
  const { data: matches, isLoading } = useMatches();
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");

  useSocketInvalidate(
    ["match:updated", "score:updated", "match:completed", "court:updated"],
    [["matches"]]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (matches ?? []).filter((m) => {
      if (filter !== "all") {
        const statusOk: Record<FilterStatus, MatchStatus[]> = {
          all: [],
          live: ["live"],
          upcoming: ["upcoming", "unscheduled", "delayed"],
          completed: ["completed", "forfeited"],
        };
        if (!statusOk[filter].includes(m.status)) return false;
      }
      if (q) {
        const names = `${m.team_a_name ?? m.placeholder_label_a ?? ""} ${m.team_b_name ?? m.placeholder_label_b ?? ""}`.toLowerCase();
        if (!names.includes(q)) return false;
      }
      return true;
    });
  }, [matches, filter, search]);

  const groups = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of filtered) {
      const label = groupLabel(m);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(m);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl sm:text-3xl text-slate-800">Match List</h1>
        <p className="text-slate-400 text-sm mt-1">{matches?.length ?? 0} matches scheduled</p>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Search by team name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-96 pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`filter-chip${filter === f.key ? " is-active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-sm text-slate-400">Loading matches…</p>}

      {!isLoading &&
        groups.map(([label, ms]) => (
          <div key={label}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">{label}</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              {ms.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </div>
          </div>
        ))}

      {!isLoading && groups.length === 0 && (
        <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl">
          <svg
            className="mx-auto text-slate-300 mb-3"
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" strokeLinecap="round" />
          </svg>
          <p className="font-semibold text-slate-500">No matches match your filters</p>
          <p className="text-sm text-slate-400 mt-1">Try clearing a filter or searching a different team name.</p>
        </div>
      )}
    </main>
  );
}
