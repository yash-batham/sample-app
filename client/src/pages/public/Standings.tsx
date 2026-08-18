import { useEffect, useState } from "react";
import { useStandings } from "../../api/hooks";
import { useSocketInvalidate } from "../../hooks/useSocketInvalidate";
import { poolLabel } from "../../utils/stage";

export default function Standings() {
  const { data: pools, isLoading } = useStandings();
  const [poolId, setPoolId] = useState<number | null>(null);

  useSocketInvalidate(
    ["match:completed", "score:updated", "pool:updated", "team:updated"],
    [["standings"]]
  );

  useEffect(() => {
    if (!poolId && pools && pools.length > 0) setPoolId(pools[0].pool_id);
  }, [pools, poolId]);

  const current = pools?.find((p) => p.pool_id === poolId) ?? pools?.[0];

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl sm:text-3xl text-slate-800">League Standings</h1>
        <p className="text-slate-400 text-sm mt-1">The top team in each pool advances to Super 4.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto scroll-rail">
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

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="standings-table">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Team</th>
                <th className="num">Games</th>
                <th className="num">W&ndash;L</th>
                <th className="num">PTS</th>
                <th className="num">SCORE DIFF</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-400 py-6">
                    Loading standings…
                  </td>
                </tr>
              )}
              {!isLoading && current?.teams.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-400 py-6">
                    No teams assigned to this pool yet.
                  </td>
                </tr>
              )}
              {current?.teams.map((t) => (
                <tr key={t.team_id} className={t.is_qualifying ? "is-qualifying" : ""}>
                  <td className="num rank-num">{t.rank}</td>
                  <td className="font-semibold text-slate-800">
                    {t.team_name}
                    {t.tiebreak_note && (
                      <span className="audit-tag ml-2">{t.tiebreak_note}</span>
                    )}
                  </td>
                  <td className="num tabular">{t.games_won + t.games_lost}</td>
                  <td className="num tabular">
                    {t.wins}-{t.losses}
                  </td>
                  <td className="num tabular font-bold text-teal-700">{t.wins * 2}</td>
                  <td className="num tabular">
                    {t.point_diff > 0 ? "+" : ""}
                    {t.point_diff}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span
            className="w-3 h-3 rounded-sm inline-block"
            style={{ background: "var(--pb-teal-50)", border: "1px solid var(--pb-teal-500)" }}
          />
          Advances to Super 4
        </span>
        <span>W&ndash;L = Match Wins&ndash;Losses</span>
        <span>Games = Total Games Played</span>
        <span>SCORE DIFF = Total Points Scored minus Allowed</span>
      </div>
    </main>
  );
}
