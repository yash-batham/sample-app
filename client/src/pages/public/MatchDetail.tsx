import { Link, useParams } from "react-router-dom";
import { useMatch, useTeam } from "../../api/hooks";
import { useSocketInvalidate } from "../../hooks/useSocketInvalidate";
import { StatusBadge } from "../../components/public/StatusBadge";
import { LiveTimer } from "../../components/public/LiveTimer";
import { stageLabel, poolLabel, courtLabel } from "../../utils/stage";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: match, isLoading } = useMatch(id, { refetchInterval: 10_000 });
  const { data: teamA } = useTeam(match?.team_a_id ?? undefined);
  const { data: teamB } = useTeam(match?.team_b_id ?? undefined);

  useSocketInvalidate(
    ["match:updated", "score:updated", "match:completed"],
    [["matches", id]]
  );

  if (isLoading || !match) {
    return (
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <p className="text-sm text-slate-400">Loading match…</p>
      </main>
    );
  }

  const nameA = match.team_a_name ?? match.placeholder_label_a ?? "TBD";
  const nameB = match.team_b_name ?? match.placeholder_label_b ?? "TBD";
  const currentGameIdx = match.games.findIndex((g) => !g.winner);
  const currentGame = currentGameIdx >= 0 ? match.games[currentGameIdx] : match.games[match.games.length - 1];
  const gameNum = currentGameIdx >= 0 ? currentGameIdx + 1 : match.games.length;

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <Link to="/matches" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-teal-700">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to Match List
      </Link>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <span className="badge-chip">
            {[match.pool_label ? poolLabel(match.pool_label) : null, stageLabel(match.stage)].filter(Boolean).join(" · ")}
          </span>
          <StatusBadge
            match={match}
            label={
              match.status === "live"
                ? `Live · Game ${gameNum}`
                : undefined
            }
          />
        </div>

        {(match.status === "completed" || match.status === "forfeited") && (
          <div className="alert-banner is-info justify-center mb-3">
            <span>
              {match.winner_team_id
                ? `MATCH COMPLETE — ${(match.winner_team_id === match.team_a_id ? nameA : nameB).toUpperCase()} WON`
                : "MATCH COMPLETE"}
            </span>
          </div>
        )}

        {match.status === "live" && (
          <div className="flex justify-end -mt-2 mb-2">
            <LiveTimer startedAt={match.started_at} className="text-sm text-slate-500" />
          </div>
        )}

        <div className="score-display border-t border-b border-slate-100">
          <div className="score-display__side">
            <Link to={match.team_a_id ? `/teams/${match.team_a_id}` : "#"} className="score-display__name hover:text-teal-700">
              {nameA}
            </Link>
            {teamA && <div className="score-display__players">{teamA.player1_name} &amp; {teamA.player2_name}</div>}
            <div className="score-display__score">{currentGame?.score_a ?? 0}</div>
          </div>
          <div className="score-display__divider">&ndash;</div>
          <div className="score-display__side">
            <Link to={match.team_b_id ? `/teams/${match.team_b_id}` : "#"} className="score-display__name hover:text-teal-700">
              {nameB}
            </Link>
            {teamB && <div className="score-display__players">{teamB.player1_name} &amp; {teamB.player2_name}</div>}
            <div className="score-display__score">{currentGame?.score_b ?? 0}</div>
          </div>
        </div>

        <div className="game-chip-row pt-4">
          {Array.from({ length: match.format_best_of }).map((_, i) => {
            const g = match.games[i];
            const isCurrent = i === currentGameIdx;
            return (
              <div key={i} className={`game-chip${isCurrent ? " is-current" : ""}`}>
                <span className="game-chip__label">
                  Game {i + 1}
                  {isCurrent && " · Live"}
                </span>
                <span className="game-chip__score">{g ? `${g.score_a}–${g.score_b}` : "–"}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="stat-tile">
          <div className="stat-tile__value !text-lg">{match.court_label ? courtLabel(match.court_label) : "TBD"}</div>
          <div className="stat-tile__label">Court</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile__value !text-lg">
            {match.format_target} Points - Set Of {match.format_best_of}
          </div>
          <div className="stat-tile__label">Format</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile__value !text-lg">{formatTime(match.scheduled_time)}</div>
          <div className="stat-tile__label">{match.status === "completed" ? "Started" : "Scheduled"}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile__value !text-lg">
            <StatusBadge match={match} />
          </div>
          <div className="stat-tile__label">Status</div>
        </div>
        {match.started_by_name && (
          <div className="stat-tile">
            <div className="stat-tile__value !text-lg">{match.started_by_name}</div>
            <div className="stat-tile__label">Referee</div>
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {[{ team: teamA, id: match.team_a_id, name: nameA }, { team: teamB, id: match.team_b_id, name: nameB }].map(
          (side, idx) => (
            <Link
              key={idx}
              to={side.id ? `/teams/${side.id}` : "#"}
              className="roster-card hover:shadow-md transition-shadow"
            >
              <span
                className="avatar"
                style={{
                  width: 48,
                  height: 48,
                  fontSize: "1rem",
                  background: idx === 0
                    ? "linear-gradient(135deg,var(--pb-teal-600),var(--pb-teal-800))"
                    : "linear-gradient(135deg,var(--pb-blue-700),var(--pb-slate-900))",
                }}
              >
                {initials(side.name)}
              </span>
              <div className="flex-1">
                <p className="font-bold text-slate-800 text-sm">{side.name}</p>
                {side.team && (
                  <p className="text-xs text-slate-400">
                    {side.team.player1_name} &amp; {side.team.player2_name}
                    {side.team.seed ? ` · Seed #${side.team.seed}` : ""}
                  </p>
                )}
                {side.team && (
                  <p className="text-xs text-teal-700 font-semibold mt-0.5">
                    {side.team.wins}&ndash;{side.team.losses} this tournament
                  </p>
                )}
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-300">
                <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          )
        )}
      </div>

      <div>
        <h2 className="font-display font-bold text-lg text-slate-800 mb-3">Match Timeline</h2>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm divide-y divide-slate-100">
          {match.events.length === 0 && (
            <p className="text-sm text-slate-400 px-4 py-3">No events recorded yet.</p>
          )}
          {[...match.events].reverse().map((ev, idx) => (
            <div key={ev.id} className="flex items-center gap-3 px-4 py-3">
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${idx === 0 ? "bg-orange-500 animate-pulse" : "bg-slate-300"}`}
              />
              <p className="text-sm text-slate-600 flex-1">{ev.description}</p>
              <span className="text-xs text-slate-400 tabular">
                {new Date(ev.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
