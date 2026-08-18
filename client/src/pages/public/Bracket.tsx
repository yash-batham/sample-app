import { Link } from "react-router-dom";
import { useMatches, useStandings, useSuper4Standings } from "../../api/hooks";
import { useSocketInvalidate } from "../../hooks/useSocketInvalidate";
import { poolLabel } from "../../utils/stage";
import type { TeamStanding } from "../../types";

function MiniStandingsTable({ teams, emptyMessage }: { teams: TeamStanding[]; emptyMessage: string }) {
  if (teams.length === 0) {
    return <p className="text-center text-slate-400 text-sm py-6">{emptyMessage}</p>;
  }
  return (
    <table className="standings-table">
      <thead>
        <tr>
          <th className="num">#</th>
          <th>Team</th>
          <th className="num">Games</th>
          <th className="num">W&ndash;L</th>
          <th className="num">PTS</th>
          <th className="num">Score Diff</th>
        </tr>
      </thead>
      <tbody>
        {teams.map((t) => (
          <tr key={t.team_id} className={t.is_qualifying ? "is-qualifying" : ""}>
            <td className="num rank-num">{t.rank}</td>
            <td className="font-semibold text-slate-800">{t.team_name}</td>
            <td className="num tabular">{t.games_won + t.games_lost}</td>
            <td className="num tabular">
              {t.wins}-{t.losses}
            </td>
            <td className="num tabular font-bold text-teal-700">{t.wins * 2}</td>
            <td className="num tabular">
              {t.point_diff >= 0 ? "+" : ""}
              {t.point_diff}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Bracket() {
  const { data: pools, isLoading: leagueLoading } = useStandings();
  const { data: super4, isLoading: super4Loading } = useSuper4Standings();
  const { data: finalMatches } = useMatches({ stage: "final" });

  useSocketInvalidate(
    ["match:updated", "match:completed", "score:updated"],
    [["standings"], ["standings-super4"], ["matches"]]
  );

  const finalMatch = (finalMatches ?? [])[0] ?? null;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div>
        <h1 className="font-display font-bold text-2xl sm:text-3xl text-slate-800">Tournament Progression</h1>
        <p className="text-slate-400 text-sm mt-1">
          League &rarr; Super 4 &rarr; Final. Pool winners advance to Super 4; the top 2 of Super 4 advance to the
          Final.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-display font-bold text-lg text-slate-800">League</h2>
        {leagueLoading && <p className="text-sm text-slate-400">Loading…</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          {(pools ?? []).map((p) => (
            <div key={p.pool_id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                <span className="font-semibold text-slate-700">{poolLabel(p.pool_label)}</span>
                <span className="text-xs text-slate-400">
                  {p.completed_matches}/{p.total_matches} complete
                </span>
              </div>
              <MiniStandingsTable teams={p.teams} emptyMessage="No teams assigned yet." />
            </div>
          ))}
          {!leagueLoading && (pools ?? []).length === 0 && (
            <p className="text-sm text-slate-400">League has not been scheduled yet.</p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display font-bold text-lg text-slate-800">Super 4</h2>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {super4Loading && <p className="text-sm text-slate-400 py-6 text-center">Loading…</p>}
          {!super4Loading && (
            <MiniStandingsTable
              teams={super4?.teams ?? []}
              emptyMessage="Not yet determined — Super 4 populates automatically once all League matches are complete."
            />
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display font-bold text-lg text-slate-800">Final</h2>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 text-center">
          {!finalMatch ? (
            <p className="text-sm text-slate-400">
              Not yet determined — the Final populates automatically once all Super 4 matches are complete.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="font-display font-bold text-lg text-teal-800">
                {finalMatch.team_a_name ?? finalMatch.placeholder_label_a ?? "TBD"} vs{" "}
                {finalMatch.team_b_name ?? finalMatch.placeholder_label_b ?? "TBD"}
              </p>
              <p className="text-sm text-slate-500 capitalize">{finalMatch.status}</p>
              <Link to={`/matches/${finalMatch.id}`} className="btn btn-outline btn-sm inline-block">
                View Match
              </Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
