import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAdminHeader } from "../../components/admin/AdminShell";
import { api } from "../../api/client";
import { useCourts, useDashboardOverview, useMatches, useSettings } from "../../api/hooks";
import { useSocketInvalidate } from "../../hooks/useSocketInvalidate";
import { useQueryClient } from "@tanstack/react-query";
import { MatchCard } from "../../components/public/MatchCard";
import { poolLabel, courtLabel } from "../../utils/stage";
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

export default function AdminOverview() {
  useAdminHeader({ title: "Tournament Zone" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: overview } = useDashboardOverview();
  const { data: courts } = useCourts();
  const { data: settings } = useSettings();
  const { data: liveMatches } = useMatches({ status: "live" });
  const { data: upcomingMatches } = useMatches({ status: "upcoming" });
  const { data: completedMatches } = useMatches({ status: "completed" });
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<number[]>([]);

  useSocketInvalidate(
    ["match:updated", "score:updated", "match:completed", "court:updated", "team:updated"],
    [["dashboard-overview"], ["courts"], ["matches"], ["settings"]]
  );

  const liveByCourtId = new Map((liveMatches ?? []).map((m) => [m.court_id, m]));
  const openCourts = (courts ?? []).filter((c) => c.status === "open" && !liveByCourtId.get(c.id));

  async function assignToCourt(matchId: number, courtId: number) {
    await api.patch(`/api/matches/${matchId}`, { court_id: courtId });
    setOpenPicker(null);
    queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
    queryClient.invalidateQueries({ queryKey: ["matches"] });
  }

  async function startMatch(matchId: number) {
    await api.post(`/api/matches/${matchId}/start`);
    navigate(`/admin/matches/${matchId}/score`);
  }

  async function markCourtReady(courtId: number) {
    await api.patch(`/api/courts/${courtId}`, { status: "open", note: null });
    queryClient.invalidateQueries({ queryKey: ["courts"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
  }

  const timeline = settings?.timeline ?? [];
  const now = Date.now();

  const upcoming = (upcomingMatches ?? [])
    .filter((m) => m.scheduled_time)
    .sort((a, b) => (a.scheduled_time! > b.scheduled_time! ? 1 : -1));
  const recent = (completedMatches ?? []).slice(0, 2);

  return (
    <>
      <div className="space-y-2">
        {(overview?.alerts ?? [])
          .map((a, idx) => ({ ...a, idx }))
          .filter((a) => !dismissed.includes(a.idx))
          .map((a) => (
            <div key={a.idx} className={`alert-banner is-${a.level}`}>
              <span className="flex-1">{a.message}</span>
              <button className="alert-banner__dismiss" onClick={() => setDismissed((d) => [...d, a.idx])} aria-label="Dismiss">
                &times;
              </button>
            </div>
          ))}
      </div>

      {timeline.length > 0 && (
        <section>
          <div className="section-heading">
            <h2 className="font-display font-bold text-lg text-slate-800">Day Timeline</h2>
            <Link to="/admin/settings" className="text-sm font-semibold text-teal-700 hover:underline">
              Edit schedule &rarr;
            </Link>
          </div>
          <div className="timeline-strip">
            {timeline.map((block) => {
              const start = new Date(block.start_time).getTime();
              const end = new Date(block.end_time).getTime();
              const isNow = now >= start && now <= end;
              const isDone = now > end;
              return (
                <div key={block.id} className={`timeline-block${isNow ? " is-now" : isDone ? " is-done" : ""}`}>
                  <div className="timeline-block__label">{block.label}</div>
                  <div className="timeline-block__time">
                    {formatTime(block.start_time)} &ndash; {formatTime(block.end_time)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="stat-tile">
          <div className="stat-tile__value">{overview?.stats.total_matches ?? 0}</div>
          <div className="stat-tile__label">Total Matches</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile__value !text-orange-600">{overview?.stats.live_now ?? 0}</div>
          <div className="stat-tile__label">Live Now</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile__value !text-teal-700">{overview?.stats.completed ?? 0}</div>
          <div className="stat-tile__label">Completed</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile__value">{overview?.stats.teams_registered ?? 0}</div>
          <div className="stat-tile__label">Teams Registered</div>
        </div>
      </div>

      <section>
        <div className="section-heading">
          <h2 className="font-display font-bold text-lg text-slate-800">Court Status</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {(courts ?? []).map((court) => {
            const match = liveByCourtId.get(court.id);
            const currentGame = match?.games.find((g) => !g.winner) ?? match?.games[match.games.length - 1];
            const pickerId = `court-${court.id}`;
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
                    <p className="text-xs text-slate-400 mb-2">
                      vs {match.team_b_name ?? match.placeholder_label_b}
                      {currentGame && court.status === "live" ? ` · ${currentGame.score_a}-${currentGame.score_b}` : ""}
                    </p>
                    {court.status === "live" ? (
                      <Link to={`/admin/matches/${match.id}/score`} className="btn btn-outline btn-sm w-full !text-[0.7rem]">
                        Manage Score
                      </Link>
                    ) : (
                      <button className="btn btn-primary btn-sm w-full !text-[0.7rem]" onClick={() => startMatch(match.id)}>
                        Start Match
                      </button>
                    )}
                  </>
                ) : court.status === "delayed" || court.status === "maintenance" ? (
                  <>
                    <p className="text-xs font-semibold text-slate-600">{court.status === "maintenance" ? "Maintenance" : "Delayed"}</p>
                    <p className="text-xs text-slate-400 mb-2">{court.note ?? "—"}</p>
                    <button className="btn btn-outline btn-sm w-full !text-[0.7rem]" onClick={() => markCourtReady(court.id)}>
                      Mark Ready
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-slate-400 mb-2">No match assigned</p>
                    <div className="assign-picker">
                      <button
                        className="btn btn-primary btn-sm w-full !text-[0.7rem]"
                        onClick={() => setOpenPicker(openPicker === pickerId ? null : pickerId)}
                      >
                        + Assign Next Match
                      </button>
                      {openPicker === pickerId && (
                        <div className="assign-picker__panel is-open">
                          {(overview?.ready_queue ?? []).length === 0 && (
                            <p className="text-xs text-slate-400 px-3 py-2">Ready queue is empty.</p>
                          )}
                          {(overview?.ready_queue ?? []).map((rq) => (
                            <button key={rq.id} className="assign-picker__option" onClick={() => assignToCourt(rq.id, court.id)}>
                              {rq.team_a_name} vs {rq.team_b_name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="section-heading">
          <h2 className="font-display font-bold text-lg text-slate-800">Ready Queue</h2>
          <span className="badge-chip">Waiting for a court</span>
        </div>
        <div className="space-y-2">
          {(overview?.ready_queue ?? []).length === 0 && (
            <p className="text-sm text-slate-400 text-center py-4">Ready Queue is empty &mdash; all assigned matches have a court.</p>
          )}
          {(overview?.ready_queue ?? []).map((rq) => {
            const pickerId = `rq-${rq.id}`;
            return (
              <div key={rq.id} className="ready-queue-item">
                <div className="ready-queue-item__teams">
                  <p>
                    {rq.team_a_name} <span className="text-slate-400 font-normal">vs</span> {rq.team_b_name}
                  </p>
                  <p className="ready-queue-item__meta">
                    {rq.pool_label ? `${poolLabel(rq.pool_label)} · ` : ""}Both teams assigned
                  </p>
                </div>
                <div className="assign-picker">
                  <button
                    className="btn btn-outline btn-sm !text-[0.7rem]"
                    onClick={() => setOpenPicker(openPicker === pickerId ? null : pickerId)}
                  >
                    Assign to Court &#9662;
                  </button>
                  {openPicker === pickerId && (
                    <div className="assign-picker__panel is-open">
                      {openCourts.length === 0 && <p className="text-xs text-slate-400 px-3 py-2">No open courts.</p>}
                      {openCourts.map((c) => (
                        <button key={c.id} className="assign-picker__option" onClick={() => assignToCourt(rq.id, c.id)}>
                          {courtLabel(c.label)} &mdash; Open
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="section-heading">
          <h2 className="font-display font-bold text-lg text-slate-800">Match Feed</h2>
          <Link to="/admin/matches" className="text-sm font-semibold text-teal-700 hover:underline">
            View all matches &rarr;
          </Link>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Live</p>
            <div className="space-y-2">
              {(liveMatches ?? []).map((m) => (
                <MatchCard key={m.id} match={m} className="!p-3" />
              ))}
              {(liveMatches ?? []).length === 0 && <p className="text-xs text-slate-400">No live matches.</p>}
            </div>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Next Up</p>
            <div className="space-y-2">
              {upcoming.slice(0, 2).map((m) => (
                <MatchCard key={m.id} match={m} className="!p-3" />
              ))}
              {upcoming.length === 0 && <p className="text-xs text-slate-400">Nothing scheduled.</p>}
            </div>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Recently Finished</p>
            <div className="space-y-2">
              {recent.map((m) => (
                <MatchCard key={m.id} match={m} className="!p-3" />
              ))}
              {recent.length === 0 && <p className="text-xs text-slate-400">No completed matches yet.</p>}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
