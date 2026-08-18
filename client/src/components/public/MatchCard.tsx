import { Link } from "react-router-dom";
import type { Match } from "../../types";
import { StatusBadge } from "./StatusBadge";
import { LiveTimer } from "./LiveTimer";
import { stageLabel, poolLabel, courtLabel } from "../../utils/stage";

function formatTime(iso: string | null) {
  if (!iso) return "TBD";
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function MatchCard({ match, className = "" }: { match: Match; className?: string }) {
  const teamA = match.team_a_name ?? match.placeholder_label_a ?? "TBD";
  const teamB = match.team_b_name ?? match.placeholder_label_b ?? "TBD";
  const isLive = match.status === "live";
  const isCompleted = match.status === "completed" || match.status === "forfeited";
  const isSingleGame = match.format_best_of === 1;
  const currentGame = match.games.find((g) => !g.winner) ?? match.games[match.games.length - 1];
  const gamesWonA = match.games.filter((g) => g.winner === "a").length;
  const gamesWonB = match.games.filter((g) => g.winner === "b").length;

  const courtPool = [match.court_label ? courtLabel(match.court_label) : null, match.pool_label ? poolLabel(match.pool_label) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link to={`/matches/${match.id}`} className={`match-card${isLive ? " is-live" : ""} ${className}`}>
      <div className="match-card__meta">
        <span className="match-card__court">{courtPool || stageLabel(match.stage)}</span>
        <StatusBadge match={match} />
      </div>

      {isCompleted ? (
        <>
          <div className="match-card__row">
            <span className={`match-card__team min-w-0 flex-1${match.winner_team_id === match.team_a_id ? " is-winner" : ""}`}>
              {teamA}
              {match.winner_team_id === match.team_a_id && (
                <span className="match-card__winner-badge" aria-label="Winner">
                  🎾
                </span>
              )}
            </span>
            <span className={`match-card__score${match.winner_team_id === match.team_a_id ? " is-winner" : ""}`}>
              {isSingleGame ? match.games[0]?.score_a ?? 0 : gamesWonA}
            </span>
          </div>
          <div className="match-card__row">
            <span className={`match-card__team min-w-0 flex-1${match.winner_team_id === match.team_b_id ? " is-winner" : ""}`}>
              {teamB}
              {match.winner_team_id === match.team_b_id && (
                <span className="match-card__winner-badge" aria-label="Winner">
                  🎾
                </span>
              )}
            </span>
            <span className={`match-card__score${match.winner_team_id === match.team_b_id ? " is-winner" : ""}`}>
              {isSingleGame ? match.games[0]?.score_b ?? 0 : gamesWonB}
            </span>
          </div>
          {match.forfeit_reason ? (
            <div className="match-card__footer">
              <span>{match.forfeit_reason}</span>
            </div>
          ) : !isSingleGame ? (
            <div className="match-card__footer">
              <span>{match.games.map((g) => `${g.score_a}-${g.score_b}`).join(", ") || "—"}</span>
            </div>
          ) : null}
        </>
      ) : isLive ? (
        <>
          <div className="match-card__row">
            <span className="match-card__team min-w-0 flex-1">{teamA}</span>
            <span className="match-card__score">{currentGame?.score_a ?? 0}</span>
          </div>
          <div className="match-card__row">
            <span className="match-card__team min-w-0 flex-1">{teamB}</span>
            <span className="match-card__score">{currentGame?.score_b ?? 0}</span>
          </div>
          <div className="match-card__footer">
            <span>
              Set {match.games.length} of {match.format_best_of}
            </span>
            <LiveTimer startedAt={match.started_at} className="text-slate-400" />
            {match.started_by_name && <span className="text-slate-400">Referee: {match.started_by_name}</span>}
          </div>
        </>
      ) : (
        <>
          <div className="match-card__row">
            <span className="match-card__team min-w-0 flex-1">{teamA}</span>
          </div>
          <div className="match-card__row">
            <span className="match-card__team min-w-0 flex-1">{teamB}</span>
          </div>
          <div className="match-card__footer">
            <span>{stageLabel(match.stage)}</span>
            <span>{match.format_target} Points - Set Of {match.format_best_of}</span>
          </div>
        </>
      )}
    </Link>
  );
}

export { formatTime };
