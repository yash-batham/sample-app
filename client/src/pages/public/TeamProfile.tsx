import { useParams } from "react-router-dom";
import { useMatches, useTeam } from "../../api/hooks";
import { useSocketInvalidate } from "../../hooks/useSocketInvalidate";
import { MatchCard } from "../../components/public/MatchCard";
import { poolLabel } from "../../utils/stage";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function TeamProfile() {
  const { id } = useParams<{ id: string }>();
  const { data: team, isLoading } = useTeam(id);
  const { data: allMatches } = useMatches(team ? { search: team.name } : undefined);

  useSocketInvalidate(
    ["match:updated", "score:updated", "match:completed", "team:updated"],
    [["teams", id], ["matches"]]
  );

  if (isLoading || !team) {
    return (
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <p className="text-sm text-slate-400">Loading team…</p>
      </main>
    );
  }

  const teamMatches = (allMatches ?? []).filter((m) => m.team_a_id === team.id || m.team_b_id === team.id);
  const current = teamMatches.find((m) => m.status === "live" || m.status === "upcoming" || m.status === "delayed");
  const history = teamMatches
    .filter((m) => m.status === "completed" || m.status === "forfeited")
    .sort((a, b) => (a.scheduled_time ?? "") < (b.scheduled_time ?? "") ? 1 : -1);

  let pointsWon = 0;
  let pointsAgainst = 0;
  for (const m of history) {
    const isA = m.team_a_id === team.id;
    for (const g of m.games) {
      pointsWon += isA ? g.score_a : g.score_b;
      pointsAgainst += isA ? g.score_b : g.score_a;
    }
  }
  const avgMargin = history.length > 0 ? Math.round((pointsWon - pointsAgainst) / history.length) : 0;
  const form = history
    .slice(0, 5)
    .map((m) => (m.winner_team_id === team.id ? "W" : "L"))
    .reverse();

  return (
    <>
      <section className="text-white" style={{ background: "linear-gradient(120deg, var(--pb-blue-900), var(--pb-teal-800))" }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex items-center gap-5">
          <span
            className="avatar flex-shrink-0"
            style={{ width: 64, height: 64, fontSize: "1.3rem", background: "rgba(255,255,255,0.15)", border: "2px solid rgba(255,255,255,0.35)" }}
          >
            {initials(team.name)}
          </span>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {team.pool_label && <span className="badge-chip !bg-white/15 !text-white">{poolLabel(team.pool_label)}</span>}
              {team.seed != null && <span className="badge-chip !bg-white/15 !text-white">Seed #{team.seed}</span>}
            </div>
            <h1 className="font-display font-bold text-2xl sm:text-3xl">{team.name}</h1>
            <p className="text-white/70 text-sm mt-0.5">
              {team.player1_name} &amp; {team.player2_name}
            </p>
          </div>
          <div className="text-right hidden sm:block">
            <div className="font-display font-bold text-3xl">
              {team.wins}&ndash;{team.losses}
            </div>
            <div className="text-xs uppercase tracking-wider text-teal-200 font-bold">Record</div>
          </div>
        </div>
      </section>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="stat-tile">
            <div className="stat-tile__value">{pointsWon}</div>
            <div className="stat-tile__label">Points Won</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile__value">{pointsAgainst}</div>
            <div className="stat-tile__label">Points Against</div>
          </div>
          <div className="stat-tile">
            <div className={`stat-tile__value ${avgMargin >= 0 ? "!text-teal-700" : "!text-red-600"}`}>
              {avgMargin > 0 ? "+" : ""}
              {avgMargin}
            </div>
            <div className="stat-tile__label">Avg Margin</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile__value flex items-center gap-1">
              {form.length > 0 ? (
                form.map((r, i) => (
                  <span
                    key={i}
                    className={`text-[10px] font-bold leading-none w-5 h-5 rounded-full flex items-center justify-center ${
                      r === "W" ? "bg-teal-100 text-teal-700" : "bg-red-100 text-red-600"
                    }`}
                  >
                    {r}
                  </span>
                ))
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </div>
            <div style={{ marginTop: '14px' }} className="stat-tile__label">Current Streak</div>
          </div>
        </div>

        {current && (
          <div>
            <h2 className="font-display font-bold text-lg text-slate-800 mb-3">Current Match</h2>
            <MatchCard match={current} className="block" />
          </div>
        )}

        <div>
          <h2 className="font-display font-bold text-lg text-slate-800 mb-3">Match History</h2>
          {history.length === 0 ? (
            <p className="text-sm text-slate-400">No completed matches yet.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {history.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
