import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAdminHeader } from "../../components/admin/AdminShell";
import { useMatches, useStandings, useSuper4Standings } from "../../api/hooks";
import { useSocketInvalidate } from "../../hooks/useSocketInvalidate";
import { poolLabel } from "../../utils/stage";
import type { TeamStanding } from "../../types";

type View = "league" | "super4" | "final";

function StandingsTable({ teams, loading, emptyMessage }: { teams: TeamStanding[]; loading: boolean; emptyMessage: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="standings-table">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Team</th>
              <th className="num">W</th>
              <th className="num">L</th>
              <th className="num">PF</th>
              <th className="num">PA</th>
              <th className="num">Diff</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="text-center text-slate-400 py-6">
                  Loading standings…
                </td>
              </tr>
            )}
            {!loading && teams.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-slate-400 py-6">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {teams.map((t) => (
              <tr key={t.team_id} className={t.is_qualifying ? "is-qualifying" : ""}>
                <td className="num rank-num">{t.rank}</td>
                <td className="font-semibold text-slate-800">{t.team_name}</td>
                <td className="num tabular">{t.wins}</td>
                <td className="num tabular">{t.losses}</td>
                <td className="num tabular">{t.points_for}</td>
                <td className="num tabular">{t.points_against}</td>
                <td className={`num tabular font-semibold ${t.point_diff >= 0 ? "text-teal-700" : "text-red-500"}`}>
                  {t.point_diff >= 0 ? "+" : ""}
                  {t.point_diff}
                </td>
                <td>{t.tiebreak_note && <span className="audit-tag">{t.tiebreak_note}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminStandings() {
  useAdminHeader({ title: "Standings & Progression", subtitle: "Track League, Super 4, and Final progress" });

  const { data: pools, isLoading: leagueLoading } = useStandings();
  const { data: super4, isLoading: super4Loading } = useSuper4Standings();
  const { data: finalMatches } = useMatches({ stage: "final" });

  const [view, setView] = useState<View>("league");
  const [poolId, setPoolId] = useState<number | null>(null);

  useSocketInvalidate(
    ["match:updated", "match:completed"],
    [["matches"], ["standings"], ["standings-super4"]]
  );

  useEffect(() => {
    if (!poolId && pools && pools.length > 0) setPoolId(pools[0].pool_id);
  }, [pools, poolId]);

  const current = pools?.find((p) => p.pool_id === poolId) ?? pools?.[0];
  const finalMatch = (finalMatches ?? [])[0] ?? null;

  return (
    <>
      <div className="flex items-center gap-2">
        <button className={`btn btn-sm ${view === "league" ? "btn-primary" : "btn-outline"}`} onClick={() => setView("league")}>
          League
        </button>
        <button className={`btn btn-sm ${view === "super4" ? "btn-primary" : "btn-outline"}`} onClick={() => setView("super4")}>
          Super 4
        </button>
        <button className={`btn btn-sm ${view === "final" ? "btn-primary" : "btn-outline"}`} onClick={() => setView("final")}>
          Final
        </button>
      </div>

      {view === "league" && (
        <div>
          <div className="flex gap-2 mb-2 overflow-x-auto scroll-rail">
            {(pools ?? []).map((p) => (
              <button
                key={p.pool_id}
                className={`pool-tab${p.pool_id === current?.pool_id ? " is-active" : ""}`}
                onClick={() => setPoolId(p.pool_id)}
              >
                {poolLabel(p.pool_label)}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between mb-3">
            <span className="badge-chip">
              {current
                ? `${poolLabel(current.pool_label)} progress: ${current.completed_matches}/${current.total_matches} matches complete`
                : "No pools yet"}
            </span>
          </div>

          <StandingsTable
            teams={current?.teams ?? []}
            loading={leagueLoading}
            emptyMessage="No teams assigned to this pool yet."
          />
          <p className="text-xs text-slate-400 mt-2">
            Tiebreakers, in order: wins, then point differential. The pool winner advances to Super 4.
          </p>
        </div>
      )}

      {view === "super4" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="badge-chip">
              {super4 && super4.total_matches > 0
                ? `Super 4 progress: ${super4.completed_matches}/${super4.total_matches} matches complete`
                : "Super 4 not yet generated"}
            </span>
          </div>
          <StandingsTable
            teams={super4?.teams ?? []}
            loading={super4Loading}
            emptyMessage="Super 4 will populate automatically once all League matches are complete."
          />
          <p className="text-xs text-slate-400 mt-2">
            Tiebreakers, in order: wins, then point differential. The top 2 teams advance to the Final.
          </p>
        </div>
      )}

      {view === "final" && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 text-center">
          {!finalMatch ? (
            <p className="text-sm text-slate-400">
              Not yet determined. The Final will populate automatically once all Super 4 matches are complete.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="font-display font-bold text-lg text-teal-800">
                {finalMatch.team_a_name ?? finalMatch.placeholder_label_a ?? "TBD"} vs{" "}
                {finalMatch.team_b_name ?? finalMatch.placeholder_label_b ?? "TBD"}
              </p>
              <p className="text-sm text-slate-500 capitalize">{finalMatch.status}</p>
              <Link to={`/admin/matches/${finalMatch.id}/score`} className="btn btn-primary btn-sm inline-block">
                View Match
              </Link>
            </div>
          )}
        </div>
      )}
    </>
  );
}
