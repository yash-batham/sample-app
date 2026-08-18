import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import { useAdminHeader } from "../../components/admin/AdminShell";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";
import { useMatch, useTeam } from "../../api/hooks";
import { useSocketInvalidate } from "../../hooks/useSocketInvalidate";
import { useToast } from "../../context/ToastContext";
import { stageLabel, courtLabel } from "../../utils/stage";
import type { Side } from "../../types";

export default function AdminScore() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: match, isLoading } = useMatch(id, { refetchInterval: 10_000 });
  const { data: teamA } = useTeam(match?.team_a_id ?? undefined);
  const { data: teamB } = useTeam(match?.team_b_id ?? undefined);
  const { showError } = useToast();

  const [editScoreOpen, setEditScoreOpen] = useState(false);
  const [editScores, setEditScores] = useState({ a: 0, b: 0 });

  useSocketInvalidate(["score:updated", "match:updated", "match:completed"], [["matches", id]]);

  const nameA = match?.team_a_name ?? match?.placeholder_label_a ?? "TBD";
  const nameB = match?.team_b_name ?? match?.placeholder_label_b ?? "TBD";

  useAdminHeader({
    title: match ? `${nameA} vs ${nameB}` : "Live Scoring",
    subtitle:
      [match ? stageLabel(match.stage) : null, match?.court_label ? courtLabel(match.court_label) : null].filter(Boolean).join(" · ") ||
      undefined,
  });

  if (isLoading || !match) {
    return <p className="text-sm text-slate-400">Loading match…</p>;
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["matches", id] });
  }

  const currentGameIdx = match.games.findIndex((g) => !g.winner);
  const currentGame = currentGameIdx >= 0 ? match.games[currentGameIdx] : match.games[match.games.length - 1];
  const isLive = match.status === "live";
  const isFinished = match.status === "completed" || match.status === "forfeited";
  const canScore = isLive && !!currentGame && !currentGame.winner;
  const controlsDisabled = !isLive || !currentGame;

  const gamesWonA = match.games.filter((g) => g.winner === "a").length;
  const gamesWonB = match.games.filter((g) => g.winner === "b").length;
  const neededToWin = Math.ceil(match.format_best_of / 2);
  const matchOver = gamesWonA >= neededToWin || gamesWonB >= neededToWin;

  async function addPoint(side: Side) {
    if (!canScore) return;
    try {
      await api.post(`/api/matches/${id}/point`, null, { params: { side } });
      invalidate();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  async function undoLast() {
    if (controlsDisabled) return;
    try {
      await api.post(`/api/matches/${id}/point/undo`);
      invalidate();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  async function correctScore(side: Side, delta: number) {
    if (controlsDisabled || !currentGame) return;
    const score_a = side === "a" ? Math.max(0, currentGame.score_a + delta) : currentGame.score_a;
    const score_b = side === "b" ? Math.max(0, currentGame.score_b + delta) : currentGame.score_b;
    try {
      await api.patch(`/api/matches/${id}/games/${currentGame.game_number}`, { score_a, score_b });
      invalidate();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  async function startNextGame() {
    try {
      await api.post(`/api/matches/${id}/next-game`);
      invalidate();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  async function completeMatch() {
    try {
      await api.post(`/api/matches/${id}/complete`);
      invalidate();
      navigate("/admin/matches");
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  function openEditScore() {
    if (!currentGame) return;
    setEditScores({ a: currentGame.score_a, b: currentGame.score_b });
    setEditScoreOpen(true);
  }

  async function submitEditScore() {
    if (!currentGame) return;
    try {
      await api.patch(`/api/matches/${id}/games/${currentGame.game_number}`, {
        score_a: editScores.a,
        score_b: editScores.b,
      });
      setEditScoreOpen(false);
      invalidate();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  const formatLabel = `${stageLabel(match.stage)} · Best of ${match.format_best_of} to ${match.format_target} points`;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="badge-chip !bg-teal-50 !text-teal-800">{formatLabel}</span>
        <div className="game-chip-row">
          {Array.from({ length: match.format_best_of }).map((_, i) => {
            const g = match.games[i];
            const isCurrent = i === currentGameIdx;
            return (
              <div key={i} className={`game-chip${isCurrent ? " is-current" : ""}`}>
                <span className="game-chip__label">
                  Game {i + 1}
                  {isCurrent ? " · Live" : ""}
                </span>
                <span className="game-chip__score">{g ? `${g.score_a}–${g.score_b}` : "–"}</span>
              </div>
            );
          })}
        </div>
      </div>

      {isFinished && (
        <div className="bg-white border-2 border-teal-500 rounded-2xl shadow-md p-5 text-center space-y-2">
          <p className="font-display font-bold text-lg text-teal-800">
            {match.winner_team_id
              ? `MATCH COMPLETE — ${(match.winner_team_id === match.team_a_id ? nameA : nameB).toUpperCase()} WON`
              : "MATCH COMPLETE"}
          </p>
          {match.status === "completed" ? (
            <button className="btn btn-outline btn-sm" onClick={openEditScore}>
              Edit Score
            </button>
          ) : (
            <p className="text-xs text-slate-400">Scoring is locked.</p>
          )}
        </div>
      )}

      {match.started_by_name && (
        <p className="text-center text-xs text-slate-400">Referee: {match.started_by_name}</p>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div
          className={`score-tap-zone${!canScore ? " is-locked" : ""}`}
          onClick={() => addPoint("a")}
        >
          <div className="score-tap-zone__name">{nameA}</div>
          {teamA && (
            <div className="score-tap-zone__players">
              {teamA.player1_name} &amp; {teamA.player2_name}
            </div>
          )}
          <div className="score-tap-zone__value">{currentGame?.score_a ?? 0}</div>
          <div className="score-tap-zone__hint">Tap anywhere to add point</div>
        </div>
        <div
          className={`score-tap-zone${!canScore ? " is-locked" : ""}`}
          onClick={() => addPoint("b")}
        >
          <div className="score-tap-zone__name">{nameB}</div>
          {teamB && (
            <div className="score-tap-zone__players">
              {teamB.player1_name} &amp; {teamB.player2_name}
            </div>
          )}
          <div className="score-tap-zone__value">{currentGame?.score_b ?? 0}</div>
          <div className="score-tap-zone__hint">Tap anywhere to add point</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button className="btn btn-outline btn-sm" disabled={controlsDisabled} onClick={() => correctScore("a", -1)}>
          &minus;1 {nameA}
        </button>
        <button className="btn btn-outline btn-sm" disabled={controlsDisabled} onClick={undoLast}>
          Undo Last Point
        </button>
        <button className="btn btn-outline btn-sm" disabled={controlsDisabled} onClick={() => correctScore("b", -1)}>
          &minus;1 {nameB}
        </button>
      </div>

      {isLive && currentGame?.winner && (
        <div className="bg-white border-2 border-teal-500 rounded-2xl shadow-md p-5 text-center space-y-3">
          <p className="font-display font-bold text-lg text-teal-800">
            Game {currentGame.game_number} Complete &mdash; {currentGame.winner === "a" ? nameA : nameB} won by{" "}
            {currentGame.winner === "a" ? currentGame.score_a : currentGame.score_b}
            &ndash;
            {currentGame.winner === "a" ? currentGame.score_b : currentGame.score_a}
          </p>
          <div className="flex flex-col items-center gap-2">
            <button className="btn btn-primary btn-lg w-full py-4 text-lg" onClick={matchOver ? completeMatch : startNextGame}>
              {matchOver ? "Complete Match" : "Confirm & Start Next Game"}
            </button>
            <button className="btn btn-outline btn-sm" onClick={openEditScore}>
              Edit Score
            </button>
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Action Log</p>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm divide-y divide-slate-100">
          {match.events.length === 0 && <p className="text-xs text-slate-400 px-4 py-3">No events yet.</p>}
          {[...match.events].reverse().map((ev) => (
            <div key={ev.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <span className="badge-chip mr-2">{ev.event_type.replace(/_/g, " ")}</span>
                {ev.event_type === "point_correction" && <span className="audit-tag mr-2">Corrected</span>}
                <span className="text-sm text-slate-600">{ev.description}</span>
              </div>
              <span className="text-xs text-slate-400 tabular flex-shrink-0">
                {new Date(ev.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={editScoreOpen} onClose={() => setEditScoreOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Edit Game {currentGame?.game_number} Score</DialogTitle>
        <DialogContent>
          <div className="flex flex-col gap-3 pt-3">
            <TextField
              label={nameA}
              type="number"
              fullWidth
              value={editScores.a}
              onChange={(e) => setEditScores((s) => ({ ...s, a: Math.max(0, Number(e.target.value)) }))}
              slotProps={{ htmlInput: { min: 0 }, inputLabel: { shrink: true } }}
            />
            <TextField
              label={nameB}
              type="number"
              fullWidth
              value={editScores.b}
              onChange={(e) => setEditScores((s) => ({ ...s, b: Math.max(0, Number(e.target.value)) }))}
              slotProps={{ htmlInput: { min: 0 }, inputLabel: { shrink: true } }}
            />
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditScoreOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={submitEditScore}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
