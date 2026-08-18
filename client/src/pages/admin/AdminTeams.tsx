import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import { useAdminHeader } from "../../components/admin/AdminShell";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";
import { usePools, useTeams } from "../../api/hooks";
import { useSocketInvalidate } from "../../hooks/useSocketInvalidate";
import { useToast } from "../../context/ToastContext";
import { poolLabel } from "../../utils/stage";
import type { Team } from "../../types";

const AVATAR_COLORS = [
  "var(--pb-teal-700)",
  "var(--pb-blue-700)",
  "var(--pb-slate-500)",
  "var(--pb-orange-500)",
  "var(--pb-teal-800)",
  "var(--pb-slate-600)",
  "var(--pb-red-600)",
  "var(--pb-blue-800)",
  "var(--pb-teal-600)",
  "var(--pb-slate-700)",
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

interface TeamFormState {
  name: string;
  player1_name: string;
  player1_phone: string;
  player2_name: string;
  player2_phone: string;
  rating: string;
  seed: string;
  pool_id: string;
}

const EMPTY_FORM: TeamFormState = {
  name: "",
  player1_name: "",
  player1_phone: "",
  player2_name: "",
  player2_phone: "",
  rating: "",
  seed: "",
  pool_id: "",
};

export default function AdminTeams() {
  useAdminHeader({
    title: "Teams",
    subtitle: "Team registration and pool assignment",
  });

  const queryClient = useQueryClient();
  const { data: pools } = usePools();
  const { showError } = useToast();

  const [search, setSearch] = useState("");
  const [poolFilter, setPoolFilter] = useState("");
  const [panel, setPanel] = useState<{ mode: "create" | "edit"; team?: Team } | null>(null);
  const [form, setForm] = useState<TeamFormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);

  const { data: allTeams } = useTeams();

  useSocketInvalidate(["team:updated"], [["teams"]]);

  const stats = useMemo(() => {
    const list = allTeams ?? [];
    return {
      registered: list.length,
      withdrawn: list.filter((t) => t.status === "withdrawn").length,
    };
  }, [allTeams]);

  const rows = useMemo(() => {
    const list = allTeams ?? [];
    const term = search.trim().toLowerCase();
    return list.filter((t) => {
      if (poolFilter && Number(poolFilter) !== t.pool_id) return false;
      if (
        term &&
        !t.name.toLowerCase().includes(term) &&
        !t.player1_name.toLowerCase().includes(term) &&
        !t.player2_name.toLowerCase().includes(term)
      ) {
        return false;
      }
      return true;
    });
  }, [allTeams, search, poolFilter]);

  async function reassignPool(team: Team, poolId: string) {
    try {
      await api.patch(`/api/teams/${team.id}`, { pool_id: poolId || null });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setPanel({ mode: "create" });
  }

  function openEdit(team: Team) {
    setForm({
      name: team.name,
      player1_name: team.player1_name,
      player1_phone: team.player1_phone ?? "",
      player2_name: team.player2_name,
      player2_phone: team.player2_phone ?? "",
      rating: team.rating != null ? String(team.rating) : "",
      seed: team.seed != null ? String(team.seed) : "",
      pool_id: team.pool_id != null ? String(team.pool_id) : "",
    });
    setPanel({ mode: "edit", team });
  }

  function closePanel() {
    setPanel(null);
    setForm(EMPTY_FORM);
  }

  async function submitPanel() {
    if (!panel) return;
    const payload: Record<string, unknown> = {
      name: form.name,
      player1_name: form.player1_name,
      player1_phone: form.player1_phone || null,
      player2_name: form.player2_name,
      player2_phone: form.player2_phone || null,
      rating: form.rating ? Number(form.rating) : null,
      seed: form.seed ? Number(form.seed) : null,
      pool_id: form.pool_id || null,
    };
    try {
      if (panel.mode === "create") {
        await api.post("/api/teams", payload);
      } else if (panel.team) {
        await api.patch(`/api/teams/${panel.team.id}`, payload);
      }
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      closePanel();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.patch(`/api/teams/${deleteTarget.id}`, { status: "withdrawn" });
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="stat-tile">
          <div className="stat-tile__value">{stats.registered}</div>
          <div className="stat-tile__label">Registered</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile__value !text-red-500">{stats.withdrawn}</div>
          <div className="stat-tile__label">Withdrawn / No-show</div>
        </div>
      </div>

      {panel && (
        <div className="form-panel">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-base text-slate-800">
              {panel.mode === "create" ? "Register New Team" : "Edit Team"}
            </h2>
            <button className="text-slate-400 hover:text-slate-600" onClick={closePanel} aria-label="Close">
              &times;
            </button>
          </div>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submitPanel();
            }}
          >
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="form-field sm:col-span-2">
                <label className="form-label">Team Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Backspin Bandits"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="form-field">
                <label className="form-label">Player 1 &mdash; Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Full name"
                  value={form.player1_name}
                  onChange={(e) => setForm((f) => ({ ...f, player1_name: e.target.value }))}
                  required
                />
              </div>
              <div className="form-field">
                <label className="form-label">Player 1 &mdash; Phone</label>
                <input
                  type="tel"
                  className="form-input"
                  placeholder="(555) 555-0100"
                  value={form.player1_phone}
                  onChange={(e) => setForm((f) => ({ ...f, player1_phone: e.target.value }))}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Player 2 &mdash; Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Full name"
                  value={form.player2_name}
                  onChange={(e) => setForm((f) => ({ ...f, player2_name: e.target.value }))}
                  required
                />
              </div>
              <div className="form-field">
                <label className="form-label">Player 2 &mdash; Phone</label>
                <input
                  type="tel"
                  className="form-input"
                  placeholder="(555) 555-0100"
                  value={form.player2_phone}
                  onChange={(e) => setForm((f) => ({ ...f, player2_phone: e.target.value }))}
                />
              </div>
              <div className="form-field">
                <label className="form-label">DUPR / Skill Rating (optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 4.2"
                  value={form.rating}
                  onChange={(e) => setForm((f) => ({ ...f, rating: e.target.value }))}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Seed (optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 3"
                  value={form.seed}
                  onChange={(e) => setForm((f) => ({ ...f, seed: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 pt-2 border-t border-teal-200/60">
              <div className="form-field" style={{ minWidth: 160 }}>
                <label className="form-label">Pool</label>
                <select
                  className="form-select"
                  value={form.pool_id}
                  onChange={(e) => setForm((f) => ({ ...f, pool_id: e.target.value }))}
                >
                  <option value="">Unassigned</option>
                  {(pools ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {poolLabel(p.label)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn btn-outline btn-sm" onClick={closePanel}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm">
                {panel.mode === "create" ? "Register Team" : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search teams or players…"
          className="form-input !w-56 !py-2"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="form-select !py-2 !w-auto" value={poolFilter} onChange={(e) => setPoolFilter(e.target.value)}>
          <option value="">All Pools</option>
          {(pools ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {poolLabel(p.label)}
            </option>
          ))}
        </select>
        <button className="btn btn-accent btn-sm ml-auto" onClick={openCreate}>
          + Register Team
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Team</th>
                <th>Players</th>
                <th>Pool</th>
                <th>Seed</th>
                <th>Record</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((team, idx) => {
                const withdrawn = team.status === "withdrawn";
                const hasRecord = team.wins > 0 || team.losses > 0;
                return (
                  <tr key={team.id}>
                    <td
                      className={`flex items-center gap-2.5 font-semibold ${
                        withdrawn ? "text-slate-500 line-through" : "text-slate-800"
                      }`}
                    >
                      <span
                        className="avatar"
                        style={{ width: 28, height: 28, fontSize: "0.65rem", background: AVATAR_COLORS[idx % AVATAR_COLORS.length] }}
                      >
                        {initials(team.name)}
                      </span>
                      {team.name}
                    </td>
                    <td className={withdrawn ? "text-slate-400" : "text-slate-500"}>
                      {team.player1_name}, {team.player2_name}
                    </td>
                    <td>
                      {withdrawn ? (
                        <span className="badge-chip">Unassigned</span>
                      ) : (
                        <select
                          className="form-select !py-1 !text-xs !w-auto"
                          value={team.pool_id ?? ""}
                          onChange={(e) => reassignPool(team, e.target.value)}
                        >
                          <option value="">Unassigned</option>
                          {(pools ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {poolLabel(p.label)}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className={`tabular ${withdrawn ? "text-slate-400" : ""}`}>
                      {team.seed != null ? `#${team.seed}` : "—"}
                    </td>
                    <td
                      className={`tabular ${
                        !hasRecord
                          ? "text-slate-400"
                          : team.wins > team.losses
                            ? "font-semibold text-teal-700"
                            : "font-semibold"
                      }`}
                    >
                      {hasRecord ? `${team.wins}-${team.losses}` : "–"}
                    </td>
                    <td className="text-right">
                      <div className="inline-flex gap-1.5">
                        <button className="btn btn-outline btn-sm" disabled={withdrawn} onClick={() => openEdit(team)}>
                          Edit
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          disabled={withdrawn}
                          onClick={() => setDeleteTarget(team)}
                        >
                          Withdraw
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-sm text-slate-400 py-8">
                    No teams match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 text-xs text-slate-400 border-t border-slate-100">
          Showing {rows.length} of {stats.registered} registered teams.
        </div>
      </div>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Withdraw team?</DialogTitle>
        <DialogContent>
          This marks <strong>{deleteTarget?.name}</strong> as withdrawn. Any scheduled matches involving this team
          will need to be re-checked.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmDelete}>
            Withdraw Team
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
