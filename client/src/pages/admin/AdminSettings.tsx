import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import { useAdminHeader } from "../../components/admin/AdminShell";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";
import { useCourts, useMatchFormats, useSettings, useStaffList } from "../../api/hooks";
import { useSocketInvalidate } from "../../hooks/useSocketInvalidate";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import type { Court, Staff, StaffRole, TimelineBlock } from "../../types";

interface FormatPresetDraft {
  label: string;
  target_score: string;
  win_by: string;
  best_of: string;
}

const EMPTY_PRESET_DRAFT: FormatPresetDraft = { label: "", target_score: "11", win_by: "2", best_of: "3" };

interface TournamentInfo {
  name: string;
  venue: string;
  venue_map_url: string;
  event_date: string;
  checkin_open_time: string;
}

interface MatchFormat {
  target_score: number;
  win_by: number;
  best_of: number;
  scoring: string;
}

interface TimelineDraft {
  id?: number;
  label: string;
  date: string;
  start: string;
  end: string;
}

interface StaffDraft {
  name: string;
  email: string;
  password: string;
  roles: StaffRole[];
  assigned_court: string;
  contact: string;
}

const DEFAULT_TOURNAMENT_INFO: TournamentInfo = { name: "", venue: "", venue_map_url: "", event_date: "", checkin_open_time: "" };
const DEFAULT_POOL_FORMAT: MatchFormat = { target_score: 15, win_by: 1, best_of: 1, scoring: "rally" };
const DEFAULT_BRACKET_FORMAT: MatchFormat = { target_score: 11, win_by: 2, best_of: 3, scoring: "rally" };
const EMPTY_STAFF_DRAFT: StaffDraft = { name: "", email: "", password: "", roles: ["referee"], assigned_court: "", contact: "" };

const ROLE_OPTIONS: StaffRole[] = ["director", "referee", "checkin_desk", "court_marshal"];
const ROLE_LABELS: Record<StaffRole, string> = {
  director: "Tournament Director",
  referee: "Referee",
  checkin_desk: "Check-in Desk",
  court_marshal: "Court Marshal",
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function splitIso(iso: string) {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (m) return { date: m[1], time: m[2] };
  const d = new Date(iso);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

function toDraft(b: TimelineBlock): TimelineDraft {
  const { date, time: start } = splitIso(b.start_time);
  const { time: end } = splitIso(b.end_time);
  return { id: b.id, label: b.label, date, start, end };
}

function draftToBody(d: TimelineDraft) {
  const date = d.date || `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}-${pad(new Date().getDate())}`;
  return { label: d.label, start_time: `${date}T${d.start || "00:00"}:00`, end_time: `${date}T${d.end || "00:00"}:00` };
}

export default function AdminSettings() {
  useAdminHeader({ title: "Settings", subtitle: "Tournament configuration, formats, timeline, and staff" });
  const queryClient = useQueryClient();
  const { data: settingsData } = useSettings();
  const { data: staffData } = useStaffList();
  const { data: formatPresets } = useMatchFormats();
  const { data: courts } = useCourts();
  const staffList: Staff[] = staffData ?? [];
  const { staff: currentStaff } = useAuth();
  const isDirector = currentStaff?.roles.includes("director") ?? false;
  const { showError } = useToast();

  useSocketInvalidate(["settings:updated"], [["settings"]]);
  useSocketInvalidate(["staff:updated"], [["staff"]]);
  useSocketInvalidate(["match_format:updated"], [["match-formats"]]);
  useSocketInvalidate(["court:updated"], [["courts"]]);

  const [presetDraft, setPresetDraft] = useState<FormatPresetDraft>(EMPTY_PRESET_DRAFT);
  const [savingPreset, setSavingPreset] = useState(false);

  const [courtLabelDraft, setCourtLabelDraft] = useState("");
  const [savingCourt, setSavingCourt] = useState(false);
  const [deleteCourtTarget, setDeleteCourtTarget] = useState<Court | null>(null);

  const [hydrated, setHydrated] = useState(false);
  const [tournamentInfo, setTournamentInfo] = useState<TournamentInfo>(DEFAULT_TOURNAMENT_INFO);
  const [poolFormat, setPoolFormat] = useState<MatchFormat>(DEFAULT_POOL_FORMAT);
  const [bracketFormat, setBracketFormat] = useState<MatchFormat>(DEFAULT_BRACKET_FORMAT);
  const [timelineRows, setTimelineRows] = useState<TimelineDraft[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingTimeline, setSavingTimeline] = useState(false);

  const [staffPanel, setStaffPanel] = useState<{ mode: "create" | "edit"; staff?: Staff } | null>(null);
  const [staffDraft, setStaffDraft] = useState<StaffDraft>(EMPTY_STAFF_DRAFT);
  const [deleteStaffTarget, setDeleteStaffTarget] = useState<Staff | null>(null);

  useEffect(() => {
    if (!settingsData || hydrated) return;
    setTournamentInfo({ ...DEFAULT_TOURNAMENT_INFO, ...(settingsData.values.tournament_info ?? {}) });
    setPoolFormat({ ...DEFAULT_POOL_FORMAT, ...(settingsData.values.pool_play_format ?? {}) });
    setBracketFormat({ ...DEFAULT_BRACKET_FORMAT, ...(settingsData.values.bracket_format ?? {}) });
    setTimelineRows((settingsData.timeline ?? []).map(toDraft));
    setHydrated(true);
  }, [settingsData, hydrated]);

  function discardChanges() {
    if (!settingsData) return;
    setTournamentInfo({ ...DEFAULT_TOURNAMENT_INFO, ...(settingsData.values.tournament_info ?? {}) });
    setPoolFormat({ ...DEFAULT_POOL_FORMAT, ...(settingsData.values.pool_play_format ?? {}) });
    setBracketFormat({ ...DEFAULT_BRACKET_FORMAT, ...(settingsData.values.bracket_format ?? {}) });
    setTimelineRows((settingsData.timeline ?? []).map(toDraft));
  }

  async function saveSettings() {
    setSavingSettings(true);
    try {
      await api.patch("/api/settings", {
        tournament_info: tournamentInfo,
        pool_play_format: poolFormat,
        bracket_format: bracketFormat,
      });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSavingSettings(false);
    }
  }

  function addTimelineRow() {
    const last = timelineRows[timelineRows.length - 1];
    const today = `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}-${pad(new Date().getDate())}`;
    setTimelineRows((rows) => [...rows, { label: "New Block", date: last?.date ?? today, start: "", end: "" }]);
  }

  function updateTimelineRow(index: number, patch: Partial<TimelineDraft>) {
    setTimelineRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeTimelineRow(index: number) {
    setTimelineRows((rows) => rows.filter((_, i) => i !== index));
  }

  async function saveTimeline() {
    setSavingTimeline(true);
    try {
      const body = timelineRows.map(draftToBody);
      const res = await api.put<TimelineBlock[]>("/api/settings/timeline", body);
      setTimelineRows(res.data.map(toDraft));
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSavingTimeline(false);
    }
  }

  function openCreateStaff() {
    setStaffDraft(EMPTY_STAFF_DRAFT);
    setStaffPanel({ mode: "create" });
  }

  function openEditStaff(s: Staff) {
    setStaffDraft({ name: s.name, email: s.email, password: "", roles: s.roles, assigned_court: s.assigned_court ?? "", contact: s.contact ?? "" });
    setStaffPanel({ mode: "edit", staff: s });
  }

  function closeStaffPanel() {
    setStaffPanel(null);
    setStaffDraft(EMPTY_STAFF_DRAFT);
  }

  function toggleDraftRole(role: StaffRole) {
    setStaffDraft((d) => ({
      ...d,
      roles: d.roles.includes(role) ? d.roles.filter((r) => r !== role) : [...d.roles, role],
    }));
  }

  async function submitStaffPanel() {
    if (!staffPanel) return;
    if (staffDraft.roles.length === 0) return;
    try {
      if (staffPanel.mode === "create") {
        await api.post("/api/staff", {
          name: staffDraft.name,
          email: staffDraft.email,
          password: staffDraft.password,
          roles: staffDraft.roles,
          assigned_court: staffDraft.assigned_court || null,
          contact: staffDraft.contact || null,
        });
      } else if (staffPanel.staff) {
        const body: Record<string, unknown> = {
          name: staffDraft.name,
          roles: staffDraft.roles,
          assigned_court: staffDraft.assigned_court || null,
          contact: staffDraft.contact || null,
        };
        if (staffDraft.password) body.password = staffDraft.password;
        await api.patch(`/api/staff/${staffPanel.staff.id}`, body);
      }
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      closeStaffPanel();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  async function confirmDeleteStaff() {
    if (!deleteStaffTarget) return;
    try {
      await api.delete(`/api/staff/${deleteStaffTarget.id}`);
      setDeleteStaffTarget(null);
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  async function addFormatPreset(e: FormEvent) {
    e.preventDefault();
    const label = presetDraft.label.trim();
    if (!label) return;
    setSavingPreset(true);
    try {
      await api.post("/api/match-formats", {
        label,
        target_score: Number(presetDraft.target_score),
        win_by: Number(presetDraft.win_by),
        best_of: Number(presetDraft.best_of),
      });
      setPresetDraft(EMPTY_PRESET_DRAFT);
      queryClient.invalidateQueries({ queryKey: ["match-formats"] });
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSavingPreset(false);
    }
  }

  async function deleteFormatPreset(id: number) {
    try {
      await api.delete(`/api/match-formats/${id}`);
      queryClient.invalidateQueries({ queryKey: ["match-formats"] });
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  async function addCourt(e: FormEvent) {
    e.preventDefault();
    const label = courtLabelDraft.trim();
    if (!label) return;
    setSavingCourt(true);
    try {
      await api.post("/api/courts", { label });
      setCourtLabelDraft("");
      queryClient.invalidateQueries({ queryKey: ["courts"] });
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSavingCourt(false);
    }
  }

  async function confirmDeleteCourt() {
    if (!deleteCourtTarget) return;
    try {
      await api.delete(`/api/courts/${deleteCourtTarget.id}`);
      setDeleteCourtTarget(null);
      queryClient.invalidateQueries({ queryKey: ["courts"] });
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <section className="form-panel">
        <div className="section-heading !mb-4">
          <h2 className="font-display font-bold text-base text-slate-800">General</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="form-field">
            <label className="form-label">Tournament Name</label>
            <input
              type="text"
              className="form-input"
              value={tournamentInfo.name}
              onChange={(e) => setTournamentInfo((v) => ({ ...v, name: e.target.value }))}
            />
          </div>
          <div className="form-field">
            <label className="form-label">Venue</label>
            <input
              type="text"
              className="form-input"
              value={tournamentInfo.venue}
              onChange={(e) => setTournamentInfo((v) => ({ ...v, venue: e.target.value }))}
            />
          </div>
          <div className="form-field">
            <label className="form-label">Venue Map URL</label>
            <input
              type="url"
              className="form-input"
              placeholder="https://maps.google.com/..."
              value={tournamentInfo.venue_map_url}
              onChange={(e) => setTournamentInfo((v) => ({ ...v, venue_map_url: e.target.value }))}
            />
          </div>
          <div className="form-field">
            <label className="form-label">Event Date</label>
            <input
              type="date"
              className="form-input"
              value={tournamentInfo.event_date}
              onChange={(e) => setTournamentInfo((v) => ({ ...v, event_date: e.target.value }))}
            />
          </div>
          <div className="form-field">
            <label className="form-label">Check-in Opens</label>
            <input
              type="time"
              className="form-input"
              value={tournamentInfo.checkin_open_time}
              onChange={(e) => setTournamentInfo((v) => ({ ...v, checkin_open_time: e.target.value }))}
            />
          </div>
        </div>
      </section>

      <section className="form-panel">
        <div className="section-heading !mb-4">
          <h2 className="font-display font-bold text-base text-slate-800">Match Format</h2>
          <span className="badge-chip">Applies tournament-wide</span>
        </div>
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <p className="text-xs font-bold uppercase tracking-wide text-teal-700 mb-3">Pool Play</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="form-field">
                <label className="form-label">Target Score</label>
                <input
                  type="number"
                  className="form-input"
                  value={poolFormat.target_score}
                  onChange={(e) => setPoolFormat((v) => ({ ...v, target_score: Number(e.target.value) }))}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Win By</label>
                <input
                  type="number"
                  className="form-input"
                  value={poolFormat.win_by}
                  onChange={(e) => setPoolFormat((v) => ({ ...v, win_by: Number(e.target.value) }))}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Games per Match</label>
                <input
                  type="number"
                  className="form-input"
                  value={poolFormat.best_of}
                  onChange={(e) => setPoolFormat((v) => ({ ...v, best_of: Number(e.target.value) }))}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Scoring</label>
                <select
                  className="form-select"
                  value={poolFormat.scoring}
                  onChange={(e) => setPoolFormat((v) => ({ ...v, scoring: e.target.value }))}
                >
                  <option value="rally">Rally Scoring</option>
                  <option value="traditional">Traditional (Server Only)</option>
                </select>
              </div>
            </div>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <p className="text-xs font-bold uppercase tracking-wide text-orange-600 mb-3">Bracket &amp; Medal Matches</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="form-field">
                <label className="form-label">Target Score</label>
                <input
                  type="number"
                  className="form-input"
                  value={bracketFormat.target_score}
                  onChange={(e) => setBracketFormat((v) => ({ ...v, target_score: Number(e.target.value) }))}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Win By</label>
                <input
                  type="number"
                  className="form-input"
                  value={bracketFormat.win_by}
                  onChange={(e) => setBracketFormat((v) => ({ ...v, win_by: Number(e.target.value) }))}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Best Of</label>
                <input
                  type="number"
                  className="form-input"
                  value={bracketFormat.best_of}
                  onChange={(e) => setBracketFormat((v) => ({ ...v, best_of: Number(e.target.value) }))}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Scoring</label>
                <select
                  className="form-select"
                  value={bracketFormat.scoring}
                  onChange={(e) => setBracketFormat((v) => ({ ...v, scoring: e.target.value }))}
                >
                  <option value="rally">Rally Scoring</option>
                  <option value="traditional">Traditional (Server Only)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          Defaults shown are tuned for a 1-day, 6-court event: short pool games keep round robin moving, best-of-3 preserves championship
          integrity once the field is cut.
        </p>
      </section>

      <section className="form-panel">
        <div className="section-heading !mb-4">
          <h2 className="font-display font-bold text-base text-slate-800">Match Format Presets</h2>
          <span className="badge-chip">Convenience picker for Schedule &amp; Edit Match</span>
        </div>
        <div className="overflow-x-auto mb-3">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Target</th>
                <th>Win By</th>
                <th>Best Of</th>
                {isDirector && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {(formatPresets ?? []).map((p) => (
                <tr key={p.id}>
                  <td className="font-semibold text-slate-800">{p.label}</td>
                  <td className="tabular">{p.target_score}</td>
                  <td className="tabular">{p.win_by}</td>
                  <td className="tabular">{p.best_of}</td>
                  {isDirector && (
                    <td className="text-right">
                      <button className="btn btn-danger btn-sm" onClick={() => deleteFormatPreset(p.id)}>
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {(formatPresets ?? []).length === 0 && (
                <tr>
                  <td colSpan={isDirector ? 5 : 4} className="text-center text-sm text-slate-400 py-6">
                    No format presets yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {isDirector && (
          <form onSubmit={addFormatPreset} className="flex items-end gap-2 flex-wrap">
            <div className="form-field">
              <label className="form-label">Label</label>
              <input
                type="text"
                className="form-input !w-48"
                placeholder="e.g. Bo3 to 11"
                value={presetDraft.label}
                onChange={(e) => setPresetDraft((d) => ({ ...d, label: e.target.value }))}
              />
            </div>
            <div className="form-field">
              <label className="form-label">Target</label>
              <input
                type="number"
                className="form-input !w-20"
                value={presetDraft.target_score}
                onChange={(e) => setPresetDraft((d) => ({ ...d, target_score: e.target.value }))}
              />
            </div>
            <div className="form-field">
              <label className="form-label">Win By</label>
              <input
                type="number"
                className="form-input !w-20"
                value={presetDraft.win_by}
                onChange={(e) => setPresetDraft((d) => ({ ...d, win_by: e.target.value }))}
              />
            </div>
            <div className="form-field">
              <label className="form-label">Best Of</label>
              <input
                type="number"
                className="form-input !w-20"
                value={presetDraft.best_of}
                onChange={(e) => setPresetDraft((d) => ({ ...d, best_of: e.target.value }))}
              />
            </div>
            <button className="btn btn-outline btn-sm" type="submit" disabled={savingPreset || !presetDraft.label.trim()}>
              + Add Preset
            </button>
          </form>
        )}
      </section>

      <section className="form-panel">
        <div className="section-heading !mb-4">
          <h2 className="font-display font-bold text-base text-slate-800">Courts</h2>
          <span className="badge-chip">Status &amp; note editing lives on Courts &amp; Schedule</span>
        </div>
        <div className="overflow-x-auto mb-3">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Status</th>
                {isDirector && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {(courts ?? []).map((c) => (
                <tr key={c.id}>
                  <td className="font-semibold text-slate-800">{c.label}</td>
                  <td className="capitalize">{c.status}</td>
                  {isDirector && (
                    <td className="text-right">
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={c.current_match_id != null}
                        title={c.current_match_id != null ? "Court has a live match" : undefined}
                        onClick={() => setDeleteCourtTarget(c)}
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {(courts ?? []).length === 0 && (
                <tr>
                  <td colSpan={isDirector ? 3 : 2} className="text-center text-sm text-slate-400 py-6">
                    No courts yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {isDirector && (
          <form onSubmit={addCourt} className="flex items-end gap-2 flex-wrap">
            <div className="form-field">
              <label className="form-label">Label</label>
              <input
                type="text"
                className="form-input !w-48"
                placeholder="e.g. Court 7"
                value={courtLabelDraft}
                onChange={(e) => setCourtLabelDraft(e.target.value)}
              />
            </div>
            <button className="btn btn-outline btn-sm" type="submit" disabled={savingCourt || !courtLabelDraft.trim()}>
              + Add Court
            </button>
          </form>
        )}
      </section>

      <section className="form-panel">
        <div className="section-heading !mb-4">
          <h2 className="font-display font-bold text-base text-slate-800">Day Timeline</h2>
          <button className="btn btn-primary btn-sm" onClick={saveTimeline} disabled={savingTimeline}>
            {savingTimeline ? "Saving…" : "Save Timeline"}
          </button>
        </div>
        <div className="space-y-2">
          {timelineRows.map((row, i) => (
            <div key={row.id ?? `new-${i}`} className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                className="form-input !w-40"
                value={row.label}
                onChange={(e) => updateTimelineRow(i, { label: e.target.value })}
              />
              <input type="time" className="form-input !w-28" value={row.start} onChange={(e) => updateTimelineRow(i, { start: e.target.value })} />
              <span className="text-slate-400 text-sm">&ndash;</span>
              <input type="time" className="form-input !w-28" value={row.end} onChange={(e) => updateTimelineRow(i, { end: e.target.value })} />
              <button className="btn btn-outline btn-sm !px-2.5" onClick={() => removeTimelineRow(i)}>
                &times;
              </button>
            </div>
          ))}
        </div>
        <button className="btn btn-outline btn-sm mt-3" onClick={addTimelineRow}>
          + Add Block
        </button>
        <p className="text-xs text-slate-400 mt-2">These blocks drive the “now” marker on the Overview day timeline.</p>
      </section>

      <section className="form-panel">
        <div className="section-heading !mb-4">
          <h2 className="font-display font-bold text-base text-slate-800">Staff &amp; Referees</h2>
          <button className="btn btn-outline btn-sm" onClick={openCreateStaff}>
            + Add Staff
          </button>
        </div>

        {staffPanel && (
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 mb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold uppercase tracking-wide text-teal-700">
                {staffPanel.mode === "create" ? "Add Staff" : "Edit Staff"}
              </p>
              <button className="text-slate-400 hover:text-slate-600" onClick={closeStaffPanel} aria-label="Close">
                &times;
              </button>
            </div>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                submitStaffPanel();
              }}
            >
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="form-field">
                  <label className="form-label">Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={staffDraft.name}
                    onChange={(e) => setStaffDraft((d) => ({ ...d, name: e.target.value }))}
                    required
                  />
                </div>
                {staffPanel.mode === "create" && (
                  <div className="form-field">
                    <label className="form-label">Email</label>
                    <input
                      type="email"
                      className="form-input"
                      value={staffDraft.email}
                      onChange={(e) => setStaffDraft((d) => ({ ...d, email: e.target.value }))}
                      required
                    />
                  </div>
                )}
                <div className="form-field sm:col-span-2">
                  <label className="form-label">Roles (director assigns one or more)</label>
                  <div className="flex flex-wrap gap-3 pt-1">
                    {ROLE_OPTIONS.map((r) => (
                      <label key={r} className="flex items-center gap-1.5 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={staffDraft.roles.includes(r)}
                          onChange={() => toggleDraftRole(r)}
                        />
                        {ROLE_LABELS[r]}
                      </label>
                    ))}
                  </div>
                  {staffDraft.roles.length === 0 && (
                    <p className="text-xs text-red-500 mt-1">Select at least one role.</p>
                  )}
                </div>
                <div className="form-field">
                  <label className="form-label">Assigned Court</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Court 1, Floating, All Courts"
                    value={staffDraft.assigned_court}
                    onChange={(e) => setStaffDraft((d) => ({ ...d, assigned_court: e.target.value }))}
                  />
                </div>
                <div className="form-field">
                  <label className="form-label">Contact</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Email or phone"
                    value={staffDraft.contact}
                    onChange={(e) => setStaffDraft((d) => ({ ...d, contact: e.target.value }))}
                  />
                </div>
                {(staffPanel.mode === "create" || isDirector) && (
                  <div className="form-field">
                    <label className="form-label">{staffPanel.mode === "create" ? "Password" : "New Password (optional)"}</label>
                    <input
                      type="password"
                      className="form-input"
                      value={staffDraft.password}
                      onChange={(e) => setStaffDraft((d) => ({ ...d, password: e.target.value }))}
                      required={staffPanel.mode === "create"}
                    />
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="btn btn-outline btn-sm" onClick={closeStaffPanel}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={staffDraft.roles.length === 0}>
                  {staffPanel.mode === "create" ? "Add Staff" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Roles</th>
                <th>Assigned Court</th>
                <th>Contact</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {staffList.map((s) => (
                <tr key={s.id}>
                  <td className="font-semibold text-slate-800">{s.name}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {s.roles.map((r) => (
                        <span key={r} className="badge-chip">
                          {ROLE_LABELS[r]}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className={s.assigned_court ? undefined : "text-slate-400"}>{s.assigned_court ?? "–"}</td>
                  <td className="text-slate-500">{s.contact ?? "–"}</td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn btn-outline btn-sm mr-1" onClick={() => openEditStaff(s)}>
                      Edit
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => setDeleteStaffTarget(s)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {staffList.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-sm text-slate-400 py-8">
                    No staff accounts yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex justify-end gap-2 pb-6">
        <button className="btn btn-outline" onClick={discardChanges}>
          Discard Changes
        </button>
        <button className="btn btn-primary" onClick={saveSettings} disabled={savingSettings}>
          {savingSettings ? "Saving…" : "Save Settings"}
        </button>
      </div>

      <Dialog open={!!deleteStaffTarget} onClose={() => setDeleteStaffTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Remove staff account?</DialogTitle>
        <DialogContent>
          This permanently deletes <strong>{deleteStaffTarget?.name}</strong>&rsquo;s staff account and revokes their login access.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteStaffTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmDeleteStaff}>
            Delete Staff
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteCourtTarget} onClose={() => setDeleteCourtTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Remove court?</DialogTitle>
        <DialogContent>
          This permanently removes <strong>{deleteCourtTarget?.label}</strong>. Any matches already assigned to it become court-unassigned.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteCourtTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmDeleteCourt}>
            Delete Court
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
