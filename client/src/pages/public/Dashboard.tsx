import { Link } from "react-router-dom";
import {
  useCourts,
  useDashboardOverview,
  useMatches,
  useSettings,
} from "../../api/hooks";
import { useSocketInvalidate } from "../../hooks/useSocketInvalidate";
import { MatchCard } from "../../components/public/MatchCard";
import { LiveTimer } from "../../components/public/LiveTimer";
import { courtLabel } from "../../utils/stage";
import type { CourtStatus } from "../../types";

const COURT_BADGE: Record<CourtStatus, string> = {
  open: "is-upcoming",
  live: "is-live",
  delayed: "is-delayed",
  maintenance: "is-delayed",
};

function formatTime(iso: string | null) {
  if (!iso) return "TBD";
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function Dashboard() {
  const { data: settings } = useSettings();
  const { data: overview } = useDashboardOverview();
  const { data: courts } = useCourts();
  const { data: liveMatches } = useMatches({ status: "live" }, { refetchInterval: 5000 });
  const { data: upcomingMatches } = useMatches({ status: "upcoming" });
  const { data: completedMatches } = useMatches({ status: "completed" });

  useSocketInvalidate(
    ["match:updated", "score:updated", "match:completed", "court:updated", "team:updated"],
    [["dashboard-overview"], ["courts"], ["matches"]]
  );

  const info = settings?.values?.tournament_info as
    | { name?: string; venue?: string; venue_map_url?: string; event_date?: string }
    | undefined;

  const liveByCourtId = new Map((liveMatches ?? []).map((m) => [m.court_id, m]));
  const upcoming = (upcomingMatches ?? [])
    .filter((m) => m.scheduled_time)
    .sort((a, b) => (a.scheduled_time! > b.scheduled_time! ? 1 : -1))
    .slice(0, 6);
  const recentResults = (completedMatches ?? []).slice(0, 6);

  return (
    <>
      <section
        className="text-white"
        style={{ background: "linear-gradient(120deg, var(--pb-blue-900), var(--pb-blue-700) 55%, var(--pb-teal-700))" }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="flex flex-col gap-[3px]">
            <h1 className="font-display font-bold text-2xl sm:text-2xl">{info?.name ?? "PickleBall"}</h1>
            {info?.event_date && (
              <p className="text-white/70 text-sm">
                {new Date(info.event_date).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}
              </p>
            )}
            {info?.venue && (
              <p className="text-teal-200 font-bold text-xs uppercase tracking-widest flex items-center gap-1.5">
                {info.venue}
                {info.venue_map_url && (
                  <a
                    href={info.venue_map_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-200 hover:text-white"
                    aria-label="Open venue location in maps"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 21s-7-6.5-7-11.5A7 7 0 0 1 19 9.5C19 14.5 12 21 12 21z" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="12" cy="9.5" r="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </a>
                )}
              </p>
            )}
            <p className="text-white/70 text-sm">
              Track the action live with real-time scores, stats, and tournament related updates.
            </p>
          </div>
          <div className="flex gap-3">
            <div className="stat-tile !bg-white/10 !border-white/15 backdrop-blur-sm">
              <div className="stat-tile__value !text-white">{overview?.stats.live_now ?? 0}</div>
              <div className="stat-tile__label !text-teal-200">Live Courts</div>
            </div>
            <div className="stat-tile !bg-white/10 !border-white/15 backdrop-blur-sm">
              <div className="stat-tile__value !text-white">{overview?.stats.teams_registered ?? 0}</div>
              <div className="stat-tile__label !text-teal-200">Teams</div>
            </div>
          </div>
        </div>
      </section>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        <section>
          <div className="section-heading">
            <h2 className="font-display font-bold text-xl text-slate-800">Live Now</h2>
            <Link to="/matches" className="text-sm font-semibold text-teal-700 hover:underline">
              View all matches &rarr;
            </Link>
          </div>
          {liveMatches && liveMatches.length > 0 ? (
            <div className="grid sm:grid-cols-2 gap-4">
              {liveMatches.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No matches live right now.</p>
          )}
        </section>

        <section>
          <div className="section-heading">
            <h2 className="font-display font-bold text-xl text-slate-800">Court Status</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {(courts ?? []).map((court) => {
              const match = liveByCourtId.get(court.id);
              const currentGame = match?.games.find((g) => !g.winner) ?? match?.games[match.games.length - 1];
              return (
                <div key={court.id} className={`court-card${court.status === "live" ? " is-live" : ""}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="court-card__num">{courtLabel(court.label)}</span>
                    <span className={`status-badge ${COURT_BADGE[court.status]}`}>
                      <span className="status-badge__dot" />
                      {court.status === "live"
                        ? "Live"
                        : court.status === "delayed"
                          ? "Delayed"
                          : court.status === "maintenance"
                            ? "Maintenance"
                            : match
                              ? formatTime(match.scheduled_time)
                              : "Open"}
                    </span>
                  </div>
                  {match ? (
                    <>
                      <p className="text-xs font-semibold text-slate-600">{match.team_a_name ?? match.placeholder_label_a}</p>
                      <p className="text-xs text-slate-400 mb-1">vs {match.team_b_name ?? match.placeholder_label_b}</p>
                      {currentGame && (
                        <p className="tabular text-sm text-teal-700 flex items-center gap-2">
                          <span>
                            {currentGame.score_a}&ndash;{currentGame.score_b}
                          </span>
                          <LiveTimer startedAt={match.started_at} className="text-xs text-slate-400" />
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-slate-400">{court.note ?? "No match assigned"}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <div className="section-heading">
            <h2 className="font-display font-bold text-xl text-slate-800">Up Next</h2>
          </div>
          <div className="flex gap-4 overflow-x-auto scroll-rail pb-2">
            {upcoming.map((m) => (
              <MatchCard key={m.id} match={m} className="flex-shrink-0 w-72" />
            ))}
          </div>
        </section>

        <section>
          <div className="section-heading">
            <h2 className="font-display font-bold text-xl text-slate-800">Recent Results</h2>
            <Link to="/standings" className="text-sm font-semibold text-teal-700 hover:underline">
              View standings &rarr;
            </Link>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {recentResults.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
