import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Button,
  IconButton,
  Menu,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { useAdminHeader } from "../../components/admin/AdminShell";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";
import { useCourts, useMatches, useMatchFormats, usePools, useTeams } from "../../api/hooks";
import { useSocketInvalidate } from "../../hooks/useSocketInvalidate";
import { useToast } from "../../context/ToastContext";
import { StatusBadge } from "../../components/public/StatusBadge";
import { stageLabel, poolLabel, courtLabel } from "../../utils/stage";
import type { Match, MatchStage, MatchStatus } from "../../types";

const STATUS_FILTERS: Array<{ value: MatchStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "unscheduled", label: "Unscheduled" },
  { value: "upcoming", label: "Upcoming" },
  { value: "live", label: "Live" },
  { value: "delayed", label: "Delayed" },
  { value: "completed", label: "Completed" },
  { value: "forfeited", label: "Forfeited" },
];

function formatTime(iso: string | null) {
  if (!iso) return "TBD";
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function toInputDateTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function humanize(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function latestEvent(match: Match) {
  if (match.events.length === 0) return null;
  return [...match.events].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
}

function scoreCell(match: Match) {
  if (match.status === "forfeited") {
    return (
      <>
        W/O <span className="text-slate-400 font-normal text-xs">({match.forfeit_reason ?? "forfeit"})</span>
      </>
    );
  }
  if (match.games.length === 0) return <span className="text-slate-400">&ndash;</span>;
  return match.games.map((g) => `${g.score_a}-${g.score_b}`).join(", ");
}

function EditDialog({
  match,
  onClose,
  onSave,
}: {
  match: Match;
  onClose: () => void;
  onSave: (id: number, patch: Record<string, unknown>) => Promise<void>;
}) {
  const { data: teams } = useTeams();
  const { data: courts } = useCourts();
  const { data: pools } = usePools();
  const { data: formatPresets } = useMatchFormats();
  const [roundLabel, setRoundLabel] = useState(match.round_label ?? "");
  const [teamA, setTeamA] = useState(match.team_a_id ?? "");
  const [teamB, setTeamB] = useState(match.team_b_id ?? "");
  const [stage, setStage] = useState<MatchStage>(match.stage);
  const [poolId, setPoolId] = useState(match.pool_id ?? "");
  const [courtId, setCourtId] = useState(match.court_id ?? "");
  const [scheduledTime, setScheduledTime] = useState(toInputDateTime(match.scheduled_time));
  const [formatId, setFormatId] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        round_label: roundLabel || null,
        team_a_id: teamA || null,
        team_b_id: teamB || null,
        stage,
        pool_id: stage === "league" ? poolId || null : null,
        court_id: courtId || null,
        scheduled_time: scheduledTime ? new Date(scheduledTime).toISOString() : null,
      };
      if (formatId) {
        const preset = (formatPresets ?? []).find((p) => p.id === Number(formatId));
        if (preset) {
          patch.format_target = preset.target_score;
          patch.format_win_by = preset.win_by;
          patch.format_best_of = preset.best_of;
        }
      }
      await onSave(match.id, patch);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Edit Match</DialogTitle>
      <DialogContent className="space-y-4 pt-2">
        <TextField
          label="Round Label"
          fullWidth
          margin="dense"
          value={roundLabel}
          onChange={(e) => setRoundLabel(e.target.value)}
        />
        <FormControl fullWidth margin="dense">
          <InputLabel>Team A</InputLabel>
          <Select label="Team A" value={teamA} onChange={(e) => setTeamA(e.target.value)}>
            <MenuItem value="">&mdash; TBD &mdash;</MenuItem>
            {(teams ?? []).map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth margin="dense">
          <InputLabel>Team B</InputLabel>
          <Select label="Team B" value={teamB} onChange={(e) => setTeamB(e.target.value)}>
            <MenuItem value="">&mdash; TBD &mdash;</MenuItem>
            {(teams ?? []).map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth margin="dense">
          <InputLabel>Stage</InputLabel>
          <Select label="Stage" value={stage} onChange={(e) => setStage(e.target.value as MatchStage)}>
            <MenuItem value="league">{stageLabel("league")}</MenuItem>
            <MenuItem value="super4">{stageLabel("super4")}</MenuItem>
            <MenuItem value="final">{stageLabel("final")}</MenuItem>
          </Select>
        </FormControl>
        {stage === "league" && (
          <FormControl fullWidth margin="dense">
            <InputLabel>Pool</InputLabel>
            <Select label="Pool" value={poolId} onChange={(e) => setPoolId(e.target.value)}>
              <MenuItem value="">&mdash; Unassigned &mdash;</MenuItem>
              {(pools ?? []).map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {poolLabel(p.label)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        <FormControl fullWidth margin="dense">
          <InputLabel>Court</InputLabel>
          <Select label="Court" value={courtId} onChange={(e) => setCourtId(e.target.value)}>
            <MenuItem value="">&mdash; Unscheduled &mdash;</MenuItem>
            {(courts ?? []).map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {courtLabel(c.label)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label="Scheduled Time"
          type="datetime-local"
          fullWidth
          margin="dense"
          slotProps={{ inputLabel: { shrink: true } }}
          value={scheduledTime}
          onChange={(e) => setScheduledTime(e.target.value)}
        />
        <FormControl fullWidth margin="dense">
          <InputLabel>Format</InputLabel>
          <Select label="Format" value={formatId} onChange={(e) => setFormatId(e.target.value)}>
            <MenuItem value="">&mdash; Keep Current &mdash;</MenuItem>
            {(formatPresets ?? []).map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={saving} onClick={handleSave}>
          Save Changes
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DelayDialog({
  match,
  onClose,
  onSave,
}: {
  match: Match;
  onClose: () => void;
  onSave: (id: number, reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState(match.delay_reason ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(match.id, reason);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Mark Match Delayed</DialogTitle>
      <DialogContent className="pt-2">
        <TextField
          label="Delay Reason"
          placeholder="e.g. Rain / weather hold, Court maintenance, Team running late"
          fullWidth
          multiline
          minRows={2}
          margin="dense"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={saving || !reason.trim()} onClick={handleSave}>
          Mark Delayed
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ForfeitDialog({
  match,
  onClose,
  onSave,
}: {
  match: Match;
  onClose: () => void;
  onSave: (id: number, winnerTeamId: number, reason: string) => Promise<void>;
}) {
  const [winner, setWinner] = useState<"a" | "b" | "">("");
  const [reason, setReason] = useState("No-show");
  const [saving, setSaving] = useState(false);
  const teamAName = match.team_a_name ?? match.placeholder_label_a ?? "Team A";
  const teamBName = match.team_b_name ?? match.placeholder_label_b ?? "Team B";

  async function handleSave() {
    const winnerId = winner === "a" ? match.team_a_id : winner === "b" ? match.team_b_id : null;
    if (!winnerId) return;
    setSaving(true);
    try {
      await onSave(match.id, winnerId, reason);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Record Forfeit</DialogTitle>
      <DialogContent className="pt-2 space-y-3">
        <RadioGroup value={winner} onChange={(e) => setWinner(e.target.value as "a" | "b")}>
          <FormControlLabel value="a" disabled={!match.team_a_id} control={<Radio />} label={`Winner: ${teamAName}`} />
          <FormControlLabel value="b" disabled={!match.team_b_id} control={<Radio />} label={`Winner: ${teamBName}`} />
        </RadioGroup>
        <TextField
          label="Reason"
          fullWidth
          margin="dense"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="error" disabled={saving || !winner} onClick={handleSave}>
          Record Forfeit
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function StartConfirmDialog({
  match,
  onClose,
  onConfirm,
}: {
  match: Match;
  onClose: () => void;
  onConfirm: (id: number, patch: Record<string, unknown>) => Promise<void>;
}) {
  const { data: teams } = useTeams();
  const { data: courts } = useCourts();
  const { data: formatPresets } = useMatchFormats();
  const [teamA, setTeamA] = useState(match.team_a_id ?? "");
  const [teamB, setTeamB] = useState(match.team_b_id ?? "");
  const [courtId, setCourtId] = useState(match.court_id ?? "");
  const [scheduledTime, setScheduledTime] = useState(toInputDateTime(match.scheduled_time));
  const [formatId, setFormatId] = useState("");
  const [saving, setSaving] = useState(false);

  const teamAName = match.team_a_name ?? match.placeholder_label_a ?? "TBD";
  const teamBName = match.team_b_name ?? match.placeholder_label_b ?? "TBD";

  async function handleConfirm() {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        team_a_id: teamA || null,
        team_b_id: teamB || null,
        court_id: courtId || null,
        scheduled_time: scheduledTime ? new Date(scheduledTime).toISOString() : null,
      };
      if (formatId) {
        const preset = (formatPresets ?? []).find((p) => p.id === Number(formatId));
        if (preset) {
          patch.format_target = preset.target_score;
          patch.format_win_by = preset.win_by;
          patch.format_best_of = preset.best_of;
        }
      }
      await onConfirm(match.id, patch);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Start Match &mdash; {teamAName} vs {teamBName}</DialogTitle>
      <DialogContent className="space-y-4 pt-2">
        <FormControl fullWidth margin="dense">
          <InputLabel>Team A</InputLabel>
          <Select label="Team A" value={teamA} onChange={(e) => setTeamA(e.target.value)}>
            <MenuItem value="">&mdash; TBD &mdash;</MenuItem>
            {(teams ?? []).map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth margin="dense">
          <InputLabel>Team B</InputLabel>
          <Select label="Team B" value={teamB} onChange={(e) => setTeamB(e.target.value)}>
            <MenuItem value="">&mdash; TBD &mdash;</MenuItem>
            {(teams ?? []).map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth margin="dense">
          <InputLabel>Court</InputLabel>
          <Select label="Court" value={courtId} onChange={(e) => setCourtId(e.target.value)}>
            <MenuItem value="">&mdash; Unscheduled &mdash;</MenuItem>
            {(courts ?? []).map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {courtLabel(c.label)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label="Scheduled Time"
          type="datetime-local"
          fullWidth
          margin="dense"
          slotProps={{ inputLabel: { shrink: true } }}
          value={scheduledTime}
          onChange={(e) => setScheduledTime(e.target.value)}
        />
        <FormControl fullWidth margin="dense">
          <InputLabel>Format</InputLabel>
          <Select label="Format" value={formatId} onChange={(e) => setFormatId(e.target.value)}>
            <MenuItem value="">&mdash; Keep Current &mdash;</MenuItem>
            {(formatPresets ?? []).map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={saving || !teamA || !teamB} onClick={handleConfirm}>
          Confirm &amp; Start
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function AdminMatches() {
  useAdminHeader({ title: "Matches", subtitle: "Full match lifecycle — schedule, start, score, resolve" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showError } = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<MatchStatus | "all">("all");
  const [poolId, setPoolId] = useState("");
  const [courtId, setCourtId] = useState("");
  const [stage, setStage] = useState<MatchStage | "">("");

  const [menuState, setMenuState] = useState<{ matchId: number; anchorEl: HTMLElement } | null>(null);
  const [editing, setEditing] = useState<Match | null>(null);
  const [delaying, setDelaying] = useState<Match | null>(null);
  const [forfeiting, setForfeiting] = useState<Match | null>(null);
  const [starting, setStarting] = useState<Match | null>(null);
  const [deleting, setDeleting] = useState<Match | null>(null);

  const { data: pools } = usePools();
  const { data: courts } = useCourts();
  const { data: matches } = useMatches({
    status: statusFilter === "all" ? undefined : statusFilter,
    pool_id: poolId || undefined,
    court_id: courtId || undefined,
    stage: stage || undefined,
    search: search || undefined,
  });

  useSocketInvalidate(["match:updated", "match:completed", "score:updated"], [["matches"]]);
  useSocketInvalidate(["match_format:updated"], [["match-formats"]]);

  const menuMatch = (matches ?? []).find((m) => m.id === menuState?.matchId) ?? null;

  function invalidateMatches() {
    queryClient.invalidateQueries({ queryKey: ["matches"] });
  }

  async function handleEditSave(id: number, patch: Record<string, unknown>) {
    try {
      await api.patch(`/api/matches/${id}`, patch);
      invalidateMatches();
      setEditing(null);
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  function handleStart(match: Match) {
    setMenuState(null);
    setStarting(match);
  }

  async function handleStartConfirm(id: number, patch: Record<string, unknown>) {
    try {
      await api.patch(`/api/matches/${id}`, patch);
      await api.post(`/api/matches/${id}/start`);
      invalidateMatches();
      setStarting(null);
      navigate(`/admin/matches/${id}/score`);
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  async function handleResume(id: number) {
    setMenuState(null);
    try {
      await api.post(`/api/matches/${id}/resume`);
      invalidateMatches();
      navigate(`/admin/matches/${id}/score`);
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  async function handleDeleteConfirm() {
    if (!deleting) return;
    const id = deleting.id;
    try {
      await api.delete(`/api/matches/${id}`);
      invalidateMatches();
      setDeleting(null);
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  async function handleForceComplete(id: number) {
    setMenuState(null);
    try {
      await api.post(`/api/matches/${id}/force-complete`);
      invalidateMatches();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  async function handleDelaySave(id: number, reason: string) {
    try {
      await api.post(`/api/matches/${id}/delay`, { reason });
      invalidateMatches();
      setDelaying(null);
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  async function handleForfeitSave(id: number, winnerTeamId: number, reason: string) {
    try {
      await api.post(`/api/matches/${id}/forfeit`, { winner_team_id: winnerTeamId, reason });
      invalidateMatches();
      setForfeiting(null);
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search teams…"
          className="form-input !w-52 !py-2"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="form-select !py-2 !w-auto" value={poolId} onChange={(e) => setPoolId(e.target.value)}>
          <option value="">All Pools</option>
          {(pools ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {poolLabel(p.label)}
            </option>
          ))}
        </select>
        <select className="form-select !py-2 !w-auto" value={courtId} onChange={(e) => setCourtId(e.target.value)}>
          <option value="">All Courts</option>
          {(courts ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {courtLabel(c.label)}
            </option>
          ))}
        </select>
        <select
          className="form-select !py-2 !w-auto"
          value={stage}
          onChange={(e) => setStage(e.target.value as MatchStage | "")}
        >
          <option value="">All Stages</option>
          <option value="league">{stageLabel("league")}</option>
          <option value="super4">{stageLabel("super4")}</option>
          <option value="final">{stageLabel("final")}</option>
        </select>
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              className={`filter-chip${statusFilter === f.value ? " is-active" : ""}`}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Match</th>
                <th>Pool</th>
                <th>Court</th>
                <th>Time</th>
                <th>Status</th>
                <th>Score</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(matches ?? []).map((match) => {
                const teamA = match.team_a_name ?? match.placeholder_label_a ?? "TBD";
                const teamB = match.team_b_name ?? match.placeholder_label_b ?? "TBD";
                const event = latestEvent(match);
                const showAudit = event && (match.status === "completed" || match.status === "forfeited");
                return (
                  <tr key={match.id}>
                    <td className="font-semibold text-slate-800">
                      {teamA} <span className="text-slate-400 font-normal">vs</span> {teamB}
                    </td>
                    <td>
                      {match.pool_label ? (
                        <span className="badge-chip">{poolLabel(match.pool_label)}</span>
                      ) : match.stage !== "league" ? (
                        <span className="badge-chip">{stageLabel(match.stage)}</span>
                      ) : (
                        <span className="text-slate-400">&ndash;</span>
                      )}
                    </td>
                    <td className={match.court_label ? "" : "text-slate-400"}>
                      {match.court_label ? courtLabel(match.court_label) : "–"}
                    </td>
                    <td className={`tabular${match.scheduled_time ? "" : " text-slate-400"}`}>
                      {match.scheduled_time ? formatTime(match.scheduled_time) : "–"}
                    </td>
                    <td>
                      <StatusBadge match={match} />
                    </td>
                    <td className="tabular font-semibold">
                      {scoreCell(match)}{" "}
                      {showAudit && event && (
                        <span className="audit-tag" title={`${event.description} · ${formatTime(event.created_at)}`}>
                          {humanize(event.event_type)}
                        </span>
                      )}
                    </td>
                    <td className="text-right">
                      {match.status === "live" ? (
                        <div className="inline-flex gap-1.5 justify-end">
                          <Link to={`/admin/matches/${match.id}/score`} className="btn btn-outline btn-sm">
                            Manage Score
                          </Link>
                          <button className="btn btn-sm !bg-slate-700 !text-white" onClick={() => handleForceComplete(match.id)}>
                            Force Complete
                          </button>
                        </div>
                      ) : match.status === "completed" ? (
                        <Link to={`/admin/matches/${match.id}/score`} className="btn btn-outline btn-sm">
                          Edit Score
                        </Link>
                      ) : match.status === "forfeited" ? (
                        <Link to={`/admin/matches/${match.id}/score`} className="btn btn-outline btn-sm">
                          View
                        </Link>
                      ) : (
                        <IconButton
                          size="small"
                          onClick={(e) => setMenuState({ matchId: match.id, anchorEl: e.currentTarget })}
                        >
                          <MoreVertIcon fontSize="small" />
                        </IconButton>
                      )}
                    </td>
                  </tr>
                );
              })}
              {(matches ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-slate-400 py-6">
                    No matches match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Menu anchorEl={menuState?.anchorEl ?? null} open={!!menuState} onClose={() => setMenuState(null)}>
        {menuMatch && menuMatch.status === "unscheduled" && [
          <MenuItem
            key="edit"
            onClick={() => {
              setEditing(menuMatch);
              setMenuState(null);
            }}
          >
            Edit
          </MenuItem>,
          <MenuItem
            key="delete"
            onClick={() => {
              setDeleting(menuMatch);
              setMenuState(null);
            }}
          >
            Delete
          </MenuItem>,
        ]}
        {menuMatch && menuMatch.status === "upcoming" && [
          <MenuItem
            key="edit"
            onClick={() => {
              setEditing(menuMatch);
              setMenuState(null);
            }}
          >
            Edit
          </MenuItem>,
          <MenuItem key="start" onClick={() => handleStart(menuMatch)}>
            Start
          </MenuItem>,
          <MenuItem
            key="delay"
            onClick={() => {
              setDelaying(menuMatch);
              setMenuState(null);
            }}
          >
            Delay
          </MenuItem>,
          <MenuItem
            key="forfeit"
            onClick={() => {
              setForfeiting(menuMatch);
              setMenuState(null);
            }}
          >
            Forfeit
          </MenuItem>,
          <MenuItem
            key="delete"
            onClick={() => {
              setDeleting(menuMatch);
              setMenuState(null);
            }}
          >
            Delete
          </MenuItem>,
        ]}
        {menuMatch && menuMatch.status === "delayed" && [
          <MenuItem
            key="edit"
            onClick={() => {
              setEditing(menuMatch);
              setMenuState(null);
            }}
          >
            Edit
          </MenuItem>,
          <MenuItem key="resume" onClick={() => handleResume(menuMatch.id)}>
            Resume
          </MenuItem>,
          <MenuItem
            key="forfeit"
            onClick={() => {
              setForfeiting(menuMatch);
              setMenuState(null);
            }}
          >
            Forfeit
          </MenuItem>,
        ]}
      </Menu>

      {editing && <EditDialog key={editing.id} match={editing} onClose={() => setEditing(null)} onSave={handleEditSave} />}
      {starting && (
        <StartConfirmDialog key={starting.id} match={starting} onClose={() => setStarting(null)} onConfirm={handleStartConfirm} />
      )}
      {delaying && <DelayDialog key={delaying.id} match={delaying} onClose={() => setDelaying(null)} onSave={handleDelaySave} />}
      {forfeiting && (
        <ForfeitDialog key={forfeiting.id} match={forfeiting} onClose={() => setForfeiting(null)} onSave={handleForfeitSave} />
      )}
      {deleting && (
        <Dialog open onClose={() => setDeleting(null)}>
          <DialogTitle>Delete match?</DialogTitle>
          <DialogContent>
            This will permanently delete this match. This cannot be undone.
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleting(null)}>Cancel</Button>
            <Button color="error" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
