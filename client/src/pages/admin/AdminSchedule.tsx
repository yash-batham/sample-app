import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import { useAdminHeader } from "../../components/admin/AdminShell";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";
import { useCourts, useMatches, useMatchFormats, usePools, useSettings, useTeams } from "../../api/hooks";
import { useSocketInvalidate } from "../../hooks/useSocketInvalidate";
import { stageLabel, poolLabel, courtLabel } from "../../utils/stage";
import type { Court, CourtStatus, Match, MatchStage } from "../../types";

const CANONICAL_STAGES: MatchStage[] = ["league", "super4", "final"];

function tabKey(m: Match) {
  return CANONICAL_STAGES.includes(m.stage) ? m.stage : m.round_label ?? "Knockout";
}

function tabLabel(key: string) {
  return CANONICAL_STAGES.includes(key as MatchStage) ? stageLabel(key as MatchStage) : key;
}

const STATUS_BADGE: Record<string, string> = {
  unscheduled: "is-upcoming",
  upcoming: "is-upcoming",
  live: "is-live",
  delayed: "is-delayed",
  completed: "is-completed",
  forfeited: "is-delayed",
};

const STATUS_LABEL: Record<string, string> = {
  unscheduled: "Unscheduled",
  upcoming: "Upcoming",
  live: "Live",
  delayed: "Delayed",
  completed: "Completed",
  forfeited: "Forfeited",
};

function toInputValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminSchedule() {
  useAdminHeader({ title: "Pools & Match Scheduler", subtitle: "Balance pools, then manually schedule each round’s matches" });
  const queryClient = useQueryClient();

  const { data: pools } = usePools();
  const { data: courts } = useCourts();
  const { data: teams } = useTeams();
  const { data: matches } = useMatches();
  const { data: formatPresets } = useMatchFormats();
  const { data: settingsData } = useSettings();

  useSocketInvalidate(["pool:updated", "team:updated"], [["pools"], ["teams"]]);
  useSocketInvalidate(["court:updated"], [["courts"]]);
  useSocketInvalidate(["match:updated"], [["matches"]]);
  useSocketInvalidate(["match_format:updated"], [["match-formats"]]);

  const [toast, setToast] = useState<{ message: string; severity: "success" | "warning" | "error" } | null>(null);

  const [newPoolLabel, setNewPoolLabel] = useState("");
  const [renamingPoolId, setRenamingPoolId] = useState<number | null>(null);
  const [renamePoolValue, setRenamePoolValue] = useState("");
  const [deletePoolTarget, setDeletePoolTarget] = useState<{ id: number; label: string } | null>(null);

  const [extraStages, setExtraStages] = useState<string[]>([]);
  const [activeStage, setActiveStage] = useState("");
  const [showAddStage, setShowAddStage] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [teamAId, setTeamAId] = useState("");
  const [teamBId, setTeamBId] = useState("");
  const [matchPoolId, setMatchPoolId] = useState("");
  const [customA, setCustomA] = useState("");
  const [customB, setCustomB] = useState("");
  const [matchFormatId, setMatchFormatId] = useState("");

  const [openPicker, setOpenPicker] = useState<string | null>(null);

  const [editingCourtId, setEditingCourtId] = useState<number | null>(null);
  const [courtDraft, setCourtDraft] = useState<{ label: string; status: CourtStatus; note: string }>({
    label: "",
    status: "open",
    note: "",
  });

  const teamsList = teams ?? [];
  const poolsList = pools ?? [];
  const courtsList = courts ?? [];
  const matchesList = matches ?? [];
  const formatPresetsList = formatPresets ?? [];

  const unassignedTeams = teamsList.filter((t) => !t.pool_id);

  const stageList = Array.from(
    new Set([...matchesList.map((m) => tabKey(m)), ...extraStages])
  );
  const stageMatches = matchesList.filter((m) => tabKey(m) === activeStage);

  useEffect(() => {
    if (activeStage && stageList.includes(activeStage)) return;
    if (stageList.length > 0) setActiveStage(stageList[0]);
  }, [stageList, activeStage]);

  useEffect(() => {
    const saved = settingsData?.values?.custom_round_labels;
    if (Array.isArray(saved)) setExtraStages(saved);
  }, [settingsData]);

  function entrantLabel(teamId: number) {
    const team = teamsList.find((t) => t.id === teamId);
    if (!team) return "";
    return `${team.name} (${team.pool_label ? poolLabel(team.pool_label) : "Unassigned"})`;
  }

  async function handleCreatePool(e: FormEvent) {
    e.preventDefault();
    const label = newPoolLabel.trim();
    if (!label) return;
    try {
      await api.post("/api/pools", { label });
      setNewPoolLabel("");
      queryClient.invalidateQueries({ queryKey: ["pools"] });
    } catch (err) {
      setToast({ message: getErrorMessage(err), severity: "error" });
    }
  }

  async function handleRenamePool(id: number) {
    const label = renamePoolValue.trim();
    setRenamingPoolId(null);
    if (!label) return;
    try {
      await api.patch(`/api/pools/${id}`, { label });
      queryClient.invalidateQueries({ queryKey: ["pools"] });
    } catch (err) {
      setToast({ message: getErrorMessage(err), severity: "error" });
    }
  }

  async function confirmDeletePool() {
    if (!deletePoolTarget) return;
    const { id } = deletePoolTarget;
    setDeletePoolTarget(null);
    try {
      await api.delete(`/api/pools/${id}`);
      queryClient.invalidateQueries({ queryKey: ["pools"] });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    } catch (err) {
      setToast({ message: getErrorMessage(err), severity: "error" });
    }
  }

  async function handleGenerateLeague() {
    try {
      const res = await api.post<{ matches_created: number }>("/api/pools/generate-league");
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      setToast({ message: `League matches generated (${res.data.matches_created} created).`, severity: "success" });
    } catch (err) {
      setToast({ message: getErrorMessage(err), severity: "error" });
    }
  }

  function handleAddStage(e: FormEvent) {
    e.preventDefault();
    const name = newStageName.trim();
    if (!name) return;
    const next = extraStages.includes(name) ? extraStages : [...extraStages, name];
    setExtraStages(next);
    setActiveStage(name);
    setNewStageName("");
    setShowAddStage(false);
    api
      .patch("/api/settings", { custom_round_labels: next })
      .then(() => queryClient.invalidateQueries({ queryKey: ["settings"] }))
      .catch((err) => setToast({ message: getErrorMessage(err), severity: "error" }));
  }

  const hasEntrantA = !!teamAId || !!customA.trim();
  const hasEntrantB = !!teamBId || !!customB.trim();
  const entrantsDistinct = !!customA.trim() || !!customB.trim() || teamAId !== teamBId;
  const canScheduleMatch = !!activeStage && hasEntrantA && hasEntrantB && entrantsDistinct && !!matchFormatId;

  async function handleAddMatch() {
    const a = customA.trim();
    const b = customB.trim();
    if (!canScheduleMatch) return;

    const body: Record<string, unknown> = {
      stage: CANONICAL_STAGES.includes(activeStage as MatchStage) ? activeStage : "league",
      pool_id: matchPoolId || null,
    };
    if (!CANONICAL_STAGES.includes(activeStage as MatchStage)) body.round_label = activeStage;
    if (a) body.placeholder_label_a = a;
    else body.team_a_id = teamAId;
    if (b) body.placeholder_label_b = b;
    else body.team_b_id = teamBId;
    const preset = formatPresetsList.find((p) => p.id === Number(matchFormatId));
    if (preset) {
      body.format_target = preset.target_score;
      body.format_win_by = preset.win_by;
      body.format_best_of = preset.best_of;
    }

    try {
      await api.post("/api/matches", body);
      setTeamAId("");
      setTeamBId("");
      setCustomA("");
      setCustomB("");
      setMatchPoolId("");
      setMatchFormatId("");
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      setToast({ message: "Match scheduled.", severity: "success" });
    } catch (err) {
      setToast({ message: getErrorMessage(err), severity: "error" });
    }
  }

  async function assignCourt(matchId: number, courtId: number) {
    try {
      await api.patch(`/api/matches/${matchId}`, { court_id: courtId });
      setOpenPicker(null);
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["courts"] });
    } catch (err) {
      setToast({ message: getErrorMessage(err), severity: "error" });
    }
  }

  async function scheduleTime(matchId: number, value: string) {
    try {
      await api.patch(`/api/matches/${matchId}`, { scheduled_time: value ? new Date(value).toISOString() : null });
      queryClient.invalidateQueries({ queryKey: ["matches"] });
    } catch (err) {
      setToast({ message: getErrorMessage(err), severity: "error" });
    }
  }

  function startEditCourt(court: Court) {
    setEditingCourtId(court.id);
    setCourtDraft({ label: court.label, status: court.status, note: court.note ?? "" });
  }

  async function saveCourt(id: number) {
    try {
      await api.patch(`/api/courts/${id}`, {
        label: courtDraft.label,
        status: courtDraft.status,
        note: courtDraft.note.trim() ? courtDraft.note.trim() : null,
      });
      setEditingCourtId(null);
      queryClient.invalidateQueries({ queryKey: ["courts"] });
      setToast({ message: "Court updated.", severity: "success" });
    } catch (err) {
      setToast({ message: getErrorMessage(err), severity: "error" });
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn btn-primary btn-sm"
          onClick={handleGenerateLeague}
          disabled={matchesList.some((m) => m.stage === "league")}
        >
          Generate League Matches
        </button>
      </div>

      <div className="grid lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1">
          <div className="section-heading">
            <h2 className="font-display font-bold text-base text-slate-800">Unassigned</h2>
          </div>
          <div className="pool-card">
            {unassignedTeams.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">All teams assigned to a pool.</p>
            ) : (
              unassignedTeams.map((t) => (
                <div className="pool-team-row" key={t.id}>
                  <span className="flex-1">
                    {t.seed ? `#${t.seed} ` : ""}
                    {t.name}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="section-heading">
            <h2 className="font-display font-bold text-base text-slate-800">Pools</h2>
            <form onSubmit={handleCreatePool} className="flex gap-2">
              <input
                type="text"
                className="form-input !py-1 !text-xs !w-auto"
                placeholder="New pool label"
                value={newPoolLabel}
                onChange={(e) => setNewPoolLabel(e.target.value)}
              />
              <button className="btn btn-outline btn-sm" type="submit">
                + Add Pool
              </button>
            </form>
          </div>

          {poolsList.length === 0 ? (
            <p className="text-sm text-slate-400">No pools yet &mdash; use &ldquo;+ Add Pool&rdquo; above.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {poolsList.map((pool) => {
                const poolTeams = teamsList.filter((t) => t.pool_id === pool.id);
                return (
                  <div className="pool-card" key={pool.id}>
                    <div className="pool-card__header">
                      {renamingPoolId === pool.id ? (
                        <input
                          autoFocus
                          className="form-input !py-1 !text-xs !w-auto"
                          value={renamePoolValue}
                          onChange={(e) => setRenamePoolValue(e.target.value)}
                          onBlur={() => handleRenamePool(pool.id)}
                          onKeyDown={(e) => e.key === "Enter" && handleRenamePool(pool.id)}
                        />
                      ) : (
                        <h3 className="font-display font-bold text-sm text-slate-800">{poolLabel(pool.label)}</h3>
                      )}
                      <div className="flex items-center gap-1.5">
                        <span className="badge-chip">{pool.team_count} teams</span>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => {
                            setRenamingPoolId(pool.id);
                            setRenamePoolValue(pool.label);
                          }}
                        >
                          Rename
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => setDeletePoolTarget({ id: pool.id, label: pool.label })}>
                          Delete
                        </button>
                      </div>
                    </div>
                    {poolTeams.length === 0 ? (
                      <p className="text-xs text-slate-400 py-2">No teams yet.</p>
                    ) : (
                      poolTeams.map((t) => (
                        <div className="pool-team-row" key={t.id}>
                          <span className="flex-1">
                            {t.seed ? `#${t.seed} ` : ""}
                            {t.name}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <section>
        <div className="section-heading">
          <h2 className="font-display font-bold text-lg text-slate-800">Schedule Matches</h2>
          {stageList.length > 0 && (
            <span className="badge-chip">
              {stageMatches.length} match{stageMatches.length === 1 ? "" : "es"} scheduled &middot; {tabLabel(activeStage)}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Pick a round, then pick two entrants, a pool, and a format to schedule the match. Matches land{" "}
          <strong>Unscheduled</strong> &mdash; assign court &amp; time from the table below.
        </p>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            {stageList.length === 0 && (
              <span className="text-xs text-slate-400">No rounds yet &mdash; add one to start scheduling.</span>
            )}
            {stageList.map((s) => (
              <button key={s} className={`pool-tab${s === activeStage ? " is-active" : ""}`} onClick={() => setActiveStage(s)}>
                {tabLabel(s)}
              </button>
            ))}
          </div>
          {showAddStage ? (
            <form onSubmit={handleAddStage} className="flex gap-2">
              <input
                autoFocus
                className="form-input !py-1 !text-xs"
                placeholder="e.g. Championship Round Robin"
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
              />
              <button className="btn btn-primary btn-sm" type="submit">
                Add
              </button>
              <button className="btn btn-outline btn-sm" type="button" onClick={() => setShowAddStage(false)}>
                Cancel
              </button>
            </form>
          ) : (
            <button className="btn btn-outline btn-sm" onClick={() => setShowAddStage(true)}>
              + Add Round / Stage
            </button>
          )}
        </div>

        <div className="form-panel mb-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div className="form-field">
              <label className="form-label">Entrant A</label>
              <select className="form-select" value={teamAId} onChange={(e) => setTeamAId(e.target.value)}>
                <option value="">Select entrant&hellip;</option>
                {teamsList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {entrantLabel(t.id)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Entrant B</label>
              <select className="form-select" value={teamBId} onChange={(e) => setTeamBId(e.target.value)}>
                <option value="">Select entrant&hellip;</option>
                {teamsList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {entrantLabel(t.id)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Pool (optional)</label>
              <select className="form-select" value={matchPoolId} onChange={(e) => setMatchPoolId(e.target.value)}>
                <option value="">Unassigned &mdash; assign later</option>
                {poolsList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {poolLabel(p.label)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Format</label>
              <select className="form-select" value={matchFormatId} onChange={(e) => setMatchFormatId(e.target.value)}>
                <option value="">Select format&hellip;</option>
                {formatPresetsList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" onClick={handleAddMatch} disabled={!canScheduleMatch}>
              + Schedule Match
            </button>
          </div>
          <div className="mt-3">
            <label className="form-label !mb-1">
              Entrant not decided yet? Type a placeholder instead of picking a team above{" "}
              <span className="text-slate-400 font-normal">(e.g. &ldquo;Winner of Pool A&rdquo; for a round whose format isn&rsquo;t finalized)</span>
            </label>
            <div className="grid sm:grid-cols-2 gap-3">
              <input
                type="text"
                className="form-input"
                placeholder="Custom entrant A (optional)"
                value={customA}
                onChange={(e) => setCustomA(e.target.value)}
              />
              <input
                type="text"
                className="form-input"
                placeholder="Custom entrant B (optional)"
                value={customB}
                onChange={(e) => setCustomB(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Match</th>
                  <th>Pool</th>
                  <th>Court &amp; Time</th>
                  <th className="text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {stageMatches.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-sm text-slate-400 text-center py-4">
                      {activeStage ? `No matches scheduled yet for ${tabLabel(activeStage)}.` : "No rounds yet."}
                    </td>
                  </tr>
                ) : (
                  stageMatches.map((m) => {
                    const pickerId = `m-${m.id}`;
                    return (
                      <tr key={m.id}>
                        <td className="font-semibold text-slate-800">
                          {m.team_a_name ?? m.placeholder_label_a} <span className="text-slate-400 font-normal">vs</span>{" "}
                          {m.team_b_name ?? m.placeholder_label_b}
                        </td>
                        <td>
                          {m.pool_label ? (
                            <span className="badge-chip">{poolLabel(m.pool_label)}</span>
                          ) : m.stage !== "league" ? (
                            <span className="badge-chip">{stageLabel(m.stage)}</span>
                          ) : (
                            <span className="text-slate-400">&ndash;</span>
                          )}
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="assign-picker">
                              <button
                                className="btn btn-outline btn-sm !text-[0.7rem]"
                                onClick={() => setOpenPicker(openPicker === pickerId ? null : pickerId)}
                              >
                                {m.court_label ? courtLabel(m.court_label) : "Assign Court"} &#9662;
                              </button>
                              {openPicker === pickerId && (
                                <div className="assign-picker__panel is-open">
                                  {courtsList.length === 0 && <p className="assign-picker__empty">No courts available.</p>}
                                  {courtsList.map((c) => (
                                    <button key={c.id} className="assign-picker__option" onClick={() => assignCourt(m.id, c.id)}>
                                      {courtLabel(c.label)} &mdash; {c.status}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <input
                              type="datetime-local"
                              className="form-input !py-1 !text-xs !w-auto"
                              defaultValue={toInputValue(m.scheduled_time)}
                              onChange={(e) => scheduleTime(m.id, e.target.value)}
                            />
                          </div>
                        </td>
                        <td className="text-right">
                          <span className={`status-badge ${STATUS_BADGE[m.status] ?? "is-upcoming"}`}>
                            <span className="status-badge__dot" />
                            {STATUS_LABEL[m.status] ?? m.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <div className="section-heading">
          <h2 className="font-display font-bold text-lg text-slate-800">Courts</h2>
          <span className="badge-chip">Edit status, note or label &mdash; add or remove courts from Settings</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {courtsList.map((court) => (
            <div className={`court-card${court.status === "live" ? " is-live" : ""}`} key={court.id}>
              {editingCourtId === court.id ? (
                <div className="space-y-2">
                  <input
                    className="form-input !py-1 !text-xs"
                    value={courtDraft.label}
                    onChange={(e) => setCourtDraft((d) => ({ ...d, label: e.target.value }))}
                  />
                  <select
                    className="form-select !py-1 !text-xs"
                    value={courtDraft.status}
                    onChange={(e) => setCourtDraft((d) => ({ ...d, status: e.target.value as CourtStatus }))}
                  >
                    <option value="open">Open</option>
                    <option value="live">Live</option>
                    <option value="delayed">Delayed</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                  <input
                    className="form-input !py-1 !text-xs"
                    placeholder="Note (optional)"
                    value={courtDraft.note}
                    onChange={(e) => setCourtDraft((d) => ({ ...d, note: e.target.value }))}
                  />
                  <div className="flex gap-1.5">
                    <button className="btn btn-primary btn-sm w-full !text-[0.7rem]" onClick={() => saveCourt(court.id)}>
                      Save
                    </button>
                    <button
                      className="btn btn-outline btn-sm w-full !text-[0.7rem]"
                      onClick={() => setEditingCourtId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="court-card__num">{courtLabel(court.label)}</span>
                    <span className={`status-badge ${STATUS_BADGE[court.status] ?? "is-upcoming"}`}>
                      <span className="status-badge__dot" />
                      {court.status === "open" ? "Open" : court.status === "live" ? "Live" : court.status === "delayed" ? "Delayed" : "Maintenance"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-2">{court.note ?? "No notes."}</p>
                  <button className="btn btn-outline btn-sm w-full !text-[0.7rem]" onClick={() => startEditCourt(court)}>
                    Edit Court
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} variant="filled">
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>

      <Dialog open={!!deletePoolTarget} onClose={() => setDeletePoolTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Delete {deletePoolTarget ? poolLabel(deletePoolTarget.label) : "pool"}?</DialogTitle>
        <DialogContent>Its teams will become unassigned. This cannot be undone.</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeletePoolTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmDeletePool}>
            Delete Pool
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
