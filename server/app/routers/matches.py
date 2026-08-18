from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.db import get_pool
from app.security import get_current_staff, require_director
from app.sockets import emit
from app.routers.notifications import push_notification
from app.routers.pools import _round_robin_rounds

router = APIRouter(prefix="/api/matches", tags=["matches"])

MATCH_SELECT = """
    SELECT m.*,
           p.label AS pool_label,
           ta.name AS team_a_name, tb.name AS team_b_name,
           c.label AS court_label,
           st.name AS started_by_name
    FROM matches m
    LEFT JOIN pools p ON p.id = m.pool_id
    LEFT JOIN teams ta ON ta.id = m.team_a_id
    LEFT JOIN teams tb ON tb.id = m.team_b_id
    LEFT JOIN courts c ON c.id = m.court_id
    LEFT JOIN staff st ON st.id = m.started_by
"""


class MatchIn(BaseModel):
    stage: str = "league"
    round_label: str | None = None
    pool_id: int | None = None
    team_a_id: int | None = None
    team_b_id: int | None = None
    placeholder_label_a: str | None = None
    placeholder_label_b: str | None = None
    court_id: int | None = None
    scheduled_time: datetime | None = None
    format_target: int = 11
    format_win_by: int = 2
    format_best_of: int = 3


class MatchPatch(BaseModel):
    round_label: str | None = None
    stage: str | None = None
    pool_id: int | None = None
    team_a_id: int | None = None
    team_b_id: int | None = None
    court_id: int | None = None
    scheduled_time: datetime | None = None
    status: str | None = None
    format_target: int | None = None
    format_win_by: int | None = None
    format_best_of: int | None = None


class DelayRequest(BaseModel):
    reason: str


class ForfeitRequest(BaseModel):
    winner_team_id: int
    reason: str


class GameOut(BaseModel):
    id: int
    game_number: int
    score_a: int
    score_b: int
    winner: str | None = None


class EventOut(BaseModel):
    id: int
    event_type: str
    description: str
    created_by: int | None = None
    created_at: str


class MatchOut(BaseModel):
    id: int
    stage: str
    round_label: str | None = None
    pool_id: int | None = None
    pool_label: str | None = None
    team_a_id: int | None = None
    team_a_name: str | None = None
    team_b_id: int | None = None
    team_b_name: str | None = None
    placeholder_label_a: str | None = None
    placeholder_label_b: str | None = None
    court_id: int | None = None
    court_label: str | None = None
    scheduled_time: str | None = None
    status: str
    delay_reason: str | None = None
    winner_team_id: int | None = None
    forfeit_reason: str | None = None
    format_target: int
    format_win_by: int
    format_best_of: int
    started_at: str | None = None
    started_by: int | None = None
    started_by_name: str | None = None
    games: list[GameOut] = []
    events: list[EventOut] = []


def check_win(score_a: int, score_b: int, target: int, win_by: int) -> str | None:
    if score_a >= target and score_a - score_b >= win_by:
        return "a"
    if score_b >= target and score_b - score_a >= win_by:
        return "b"
    return None


def validate_score_correction(score_a: int, score_b: int, target: int, win_by: int) -> str | None:
    """Validate a manually-entered game score is actually reachable under this match's
    scoring rules, and return the resulting winner side (or None if still in progress).

    Play stops the instant the leading side reaches the target with at least `win_by`
    margin, so if the winning score is above the target, the margin at that point must
    be exactly `win_by` — anything larger would have ended the game earlier.
    """
    if score_a < 0 or score_b < 0:
        raise HTTPException(status_code=400, detail="Scores cannot be negative")

    winner = check_win(score_a, score_b, target, win_by)
    if winner:
        winner_score = max(score_a, score_b)
        loser_score = min(score_a, score_b)
        margin = winner_score - loser_score
        if winner_score > target and margin != win_by:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Invalid score: {winner_score}-{loser_score} isn't reachable. "
                    f"With a win-by of {win_by}, play stops as soon as that margin is reached, "
                    f"so a game only ever finishes above {target} with an exact {win_by}-point margin."
                ),
            )
    return winner


async def _load_match(pool, match_id: int, with_games=True, with_events=False) -> MatchOut | None:
    row = await pool.fetchrow(MATCH_SELECT + " WHERE m.id = $1", match_id)
    if row is None:
        return None
    data = dict(row)
    data["scheduled_time"] = data["scheduled_time"].isoformat() if data["scheduled_time"] else None
    data["started_at"] = data["started_at"].isoformat() if data["started_at"] else None
    games, events = [], []
    if with_games:
        game_rows = await pool.fetch("SELECT * FROM games WHERE match_id=$1 ORDER BY game_number", match_id)
        games = [GameOut(**dict(g)) for g in game_rows]
    if with_events:
        event_rows = await pool.fetch(
            "SELECT * FROM match_events WHERE match_id=$1 ORDER BY created_at DESC", match_id
        )
        events = [EventOut(**(dict(e) | {"created_at": e["created_at"].isoformat()})) for e in event_rows]
    return MatchOut(**data, games=games, events=events)


async def _broadcast_match(pool, match_id: int, event: str = "match:updated"):
    match = await _load_match(pool, match_id)
    if match:
        await emit(event, match.model_dump(mode="json"))
    return match


async def _games_by_match(pool, match_ids: list[int]) -> dict[int, list[GameOut]]:
    if not match_ids:
        return {}
    rows = await pool.fetch(
        "SELECT * FROM games WHERE match_id = ANY($1::int[]) ORDER BY match_id, game_number", match_ids
    )
    games_by_match: dict[int, list[GameOut]] = {}
    for row in rows:
        games_by_match.setdefault(row["match_id"], []).append(GameOut(**dict(row)))
    return games_by_match


@router.get("", response_model=list[MatchOut])
async def list_matches(
    status: str | None = None,
    pool_id: int | None = None,
    court_id: int | None = None,
    stage: str | None = None,
    search: str | None = None,
):
    pool = get_pool()
    query = MATCH_SELECT + " WHERE 1=1"
    args: list = []
    if status:
        args.append(status)
        query += f" AND m.status = ${len(args)}"
    if pool_id:
        args.append(pool_id)
        query += f" AND m.pool_id = ${len(args)}"
    if court_id:
        args.append(court_id)
        query += f" AND m.court_id = ${len(args)}"
    if stage:
        args.append(stage)
        query += f" AND m.stage = ${len(args)}"
    if search:
        args.append(f"%{search}%")
        query += f" AND (ta.name ILIKE ${len(args)} OR tb.name ILIKE ${len(args)})"
    query += " ORDER BY m.scheduled_time NULLS LAST, m.created_at"

    rows = await pool.fetch(query, *args)
    games_by_match = await _games_by_match(pool, [row["id"] for row in rows])
    results = []
    for row in rows:
        data = dict(row)
        data["scheduled_time"] = data["scheduled_time"].isoformat() if data["scheduled_time"] else None
        data["started_at"] = data["started_at"].isoformat() if data["started_at"] else None
        results.append(MatchOut(**data, games=games_by_match.get(row["id"], []), events=[]))
    return results


@router.get("/{match_id}", response_model=MatchOut)
async def get_match(match_id: int):
    pool = get_pool()
    match = await _load_match(pool, match_id, with_events=True)
    if match is None:
        raise HTTPException(status_code=404, detail="Match not found")
    return match


@router.post("", response_model=MatchOut, status_code=201)
async def create_match(payload: MatchIn, _: dict = Depends(get_current_staff)):
    pool = get_pool()
    status = "unscheduled" if payload.court_id is None or payload.scheduled_time is None else "upcoming"
    row = await pool.fetchrow(
        """INSERT INTO matches (stage, round_label, pool_id, team_a_id, team_b_id,
                                 placeholder_label_a, placeholder_label_b, court_id, scheduled_time,
                                 status, format_target, format_win_by, format_best_of)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           RETURNING id""",
        payload.stage, payload.round_label, payload.pool_id, payload.team_a_id, payload.team_b_id,
        payload.placeholder_label_a, payload.placeholder_label_b, payload.court_id, payload.scheduled_time,
        status, payload.format_target, payload.format_win_by, payload.format_best_of,
    )
    match = await _broadcast_match(pool, row["id"])
    return match


@router.delete("/{match_id}", status_code=204)
async def delete_match(match_id: int, _: dict = Depends(require_director)):
    pool = get_pool()
    existing = await pool.fetchrow("SELECT status FROM matches WHERE id=$1", match_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Match not found")
    if existing["status"] not in ("unscheduled", "upcoming"):
        raise HTTPException(status_code=409, detail="Only unscheduled or upcoming matches can be deleted")
    await pool.execute("DELETE FROM matches WHERE id=$1", match_id)
    await emit("match:updated", {"id": match_id, "deleted": True})


@router.patch("/{match_id}", response_model=MatchOut)
async def update_match(match_id: int, payload: MatchPatch, _: dict = Depends(get_current_staff)):
    pool = get_pool()
    existing = await pool.fetchrow("SELECT * FROM matches WHERE id=$1", match_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Match not found")

    fields = payload.model_dump(exclude_unset=True)
    updated = dict(existing) | fields
    new_status = updated["status"]
    became_upcoming = (
        "status" not in fields and updated["court_id"] and updated["scheduled_time"] and existing["status"] == "unscheduled"
    )
    if became_upcoming:
        new_status = "upcoming"

    await pool.execute(
        """UPDATE matches SET round_label=$1, stage=$2, pool_id=$3, team_a_id=$4, team_b_id=$5, court_id=$6,
                               scheduled_time=$7, status=$8, format_target=$9, format_win_by=$10,
                               format_best_of=$11, updated_at=now() WHERE id=$12""",
        updated["round_label"], updated["stage"], updated["pool_id"], updated["team_a_id"], updated["team_b_id"],
        updated["court_id"], updated["scheduled_time"], new_status, updated["format_target"], updated["format_win_by"],
        updated["format_best_of"], match_id,
    )
    if updated["court_id"]:
        await pool.execute(
            "UPDATE courts SET status = CASE WHEN status='maintenance' THEN status ELSE 'open' END WHERE id=$1",
            updated["court_id"],
        )
    match = await _broadcast_match(pool, match_id)
    if became_upcoming and match:
        team_a = match.team_a_name or match.placeholder_label_a or "TBD"
        team_b = match.team_b_name or match.placeholder_label_b or "TBD"
        court = f" to Court {match.court_label}" if match.court_label else ""
        await push_notification(pool, f"{team_a} vs {team_b} assigned{court}.")
    return match


@router.post("/{match_id}/start", response_model=MatchOut)
async def start_match(match_id: int, current_staff: dict = Depends(get_current_staff)):
    pool = get_pool()
    await pool.execute(
        "UPDATE matches SET status='live', started_at=now(), started_by=$1, updated_at=now() WHERE id=$2",
        current_staff["id"], match_id,
    )
    match = await pool.fetchrow("SELECT court_id, format_target, format_win_by, format_best_of FROM matches WHERE id=$1", match_id)
    if match["court_id"]:
        await pool.execute("UPDATE courts SET status='live', updated_at=now() WHERE id=$1", match["court_id"])
        await emit("court:updated", {"id": match["court_id"]})
    existing_game = await pool.fetchrow("SELECT id FROM games WHERE match_id=$1 AND game_number=1", match_id)
    if existing_game is None:
        await pool.execute("INSERT INTO games (match_id, game_number) VALUES ($1, 1)", match_id)
    await pool.execute(
        "INSERT INTO match_events (match_id, event_type, description) VALUES ($1, 'note', 'Match started')",
        match_id,
    )
    match_out = await _broadcast_match(pool, match_id)
    if match_out:
        team_a = match_out.team_a_name or match_out.placeholder_label_a or "TBD"
        team_b = match_out.team_b_name or match_out.placeholder_label_b or "TBD"
        court = f" on Court {match_out.court_label}" if match_out.court_label else ""
        await push_notification(pool, f"{team_a} vs {team_b} is now live{court}.")
    return match_out


@router.post("/{match_id}/resume", response_model=MatchOut)
async def resume_match(match_id: int, _: dict = Depends(get_current_staff)):
    pool = get_pool()
    existing = await pool.fetchrow("SELECT status FROM matches WHERE id=$1", match_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Match not found")
    if existing["status"] != "delayed":
        raise HTTPException(status_code=409, detail="Match is not delayed")
    await pool.execute("UPDATE matches SET status='live', updated_at=now() WHERE id=$1", match_id)
    match_out = await _broadcast_match(pool, match_id)
    if match_out:
        team_a = match_out.team_a_name or match_out.placeholder_label_a or "TBD"
        team_b = match_out.team_b_name or match_out.placeholder_label_b or "TBD"
        await push_notification(pool, f"{team_a} vs {team_b} has resumed.")
    return match_out


@router.post("/{match_id}/delay", response_model=MatchOut)
async def delay_match(match_id: int, payload: DelayRequest, _: dict = Depends(get_current_staff)):
    pool = get_pool()
    await pool.execute(
        "UPDATE matches SET status='delayed', delay_reason=$1, updated_at=now() WHERE id=$2",
        payload.reason, match_id,
    )
    await pool.execute(
        "INSERT INTO match_events (match_id, event_type, description) VALUES ($1, 'delay', $2)",
        match_id, payload.reason,
    )
    match_out = await _broadcast_match(pool, match_id)
    if match_out:
        team_a = match_out.team_a_name or match_out.placeholder_label_a or "TBD"
        team_b = match_out.team_b_name or match_out.placeholder_label_b or "TBD"
        await push_notification(pool, f"{team_a} vs {team_b} delayed — {payload.reason}", level="warning")
    return match_out


@router.post("/{match_id}/forfeit", response_model=MatchOut)
async def forfeit_match(match_id: int, payload: ForfeitRequest, _: dict = Depends(get_current_staff)):
    pool = get_pool()
    await pool.execute(
        """UPDATE matches SET status='forfeited', winner_team_id=$1, forfeit_reason=$2,
                               completed_at=now(), updated_at=now() WHERE id=$3""",
        payload.winner_team_id, payload.reason, match_id,
    )
    await pool.execute(
        "INSERT INTO match_events (match_id, event_type, description) VALUES ($1, 'forfeit', $2)",
        match_id, payload.reason,
    )
    await _advance_stage(pool, match_id)
    match_out = await _broadcast_match(pool, match_id, event="match:completed")
    if match_out:
        winner_name = match_out.team_a_name if payload.winner_team_id == match_out.team_a_id else match_out.team_b_name
        loser_name = match_out.team_b_name if payload.winner_team_id == match_out.team_a_id else match_out.team_a_name
        await push_notification(pool, f"{winner_name or 'TBD'} wins by forfeit over {loser_name or 'TBD'}.")
    return match_out


@router.post("/{match_id}/force-complete", response_model=MatchOut)
async def force_complete_match(match_id: int, _: dict = Depends(get_current_staff)):
    pool = get_pool()
    games = await pool.fetch("SELECT * FROM games WHERE match_id=$1 ORDER BY game_number", match_id)
    wins_a = sum(1 for g in games if g["winner"] == "a")
    wins_b = sum(1 for g in games if g["winner"] == "b")
    winner_team_id = None
    match = await pool.fetchrow("SELECT team_a_id, team_b_id FROM matches WHERE id=$1", match_id)
    if wins_a != wins_b:
        winner_team_id = match["team_a_id"] if wins_a > wins_b else match["team_b_id"]
    await pool.execute(
        "UPDATE matches SET status='completed', winner_team_id=$1, completed_at=now(), updated_at=now() WHERE id=$2",
        winner_team_id, match_id,
    )
    if winner_team_id:
        await _advance_stage(pool, match_id)
    match_out = await _broadcast_match(pool, match_id, event="match:completed")
    if match_out:
        if winner_team_id:
            winner_name = match_out.team_a_name if winner_team_id == match_out.team_a_id else match_out.team_b_name
            loser_name = match_out.team_b_name if winner_team_id == match_out.team_a_id else match_out.team_a_name
            await push_notification(pool, f"{winner_name or 'TBD'} defeats {loser_name or 'TBD'}.")
        else:
            await push_notification(pool, "Match completed.")
    return match_out


@router.post("/{match_id}/point")
async def add_point(match_id: int, side: str, _: dict = Depends(get_current_staff)):
    pool = get_pool()
    match = await pool.fetchrow("SELECT * FROM matches WHERE id=$1", match_id)
    if match is None:
        raise HTTPException(status_code=404, detail="Match not found")
    game = await pool.fetchrow(
        "SELECT * FROM games WHERE match_id=$1 AND winner IS NULL ORDER BY game_number DESC LIMIT 1", match_id
    )
    if game is None:
        raise HTTPException(status_code=400, detail="No active game for this match")

    score_a = game["score_a"] + (1 if side == "a" else 0)
    score_b = game["score_b"] + (1 if side == "b" else 0)
    winner = check_win(score_a, score_b, match["format_target"], match["format_win_by"])

    await pool.execute(
        """UPDATE games SET score_a=$1, score_b=$2, last_scorer_side=$3, winner=$4::match_side,
                             completed_at = CASE WHEN $4::match_side IS NOT NULL THEN now() ELSE completed_at END
           WHERE id=$5""",
        score_a, score_b, side, winner, game["id"],
    )
    if winner:
        await pool.execute(
            "INSERT INTO match_events (match_id, event_type, description) VALUES ($1, 'note', $2)",
            match_id, f"Game {game['game_number']} complete: {score_a}-{score_b}",
        )
    return await _broadcast_match(pool, match_id, event="score:updated")


@router.post("/{match_id}/point/undo")
async def undo_point(match_id: int, _: dict = Depends(get_current_staff)):
    pool = get_pool()
    game = await pool.fetchrow(
        "SELECT * FROM games WHERE match_id=$1 ORDER BY game_number DESC LIMIT 1", match_id
    )
    if game is None or game["last_scorer_side"] is None:
        raise HTTPException(status_code=400, detail="Nothing to undo")

    side = game["last_scorer_side"]
    score_a = game["score_a"] - (1 if side == "a" else 0)
    score_b = game["score_b"] - (1 if side == "b" else 0)
    await pool.execute(
        "UPDATE games SET score_a=$1, score_b=$2, last_scorer_side=NULL, winner=NULL, completed_at=NULL WHERE id=$3",
        score_a, score_b, game["id"],
    )
    return await _broadcast_match(pool, match_id, event="score:updated")


class GameCorrection(BaseModel):
    score_a: int
    score_b: int


@router.patch("/{match_id}/games/{game_number}")
async def correct_game_score(
    match_id: int, game_number: int, payload: GameCorrection, staff: dict = Depends(get_current_staff)
):
    pool = get_pool()
    game = await pool.fetchrow("SELECT * FROM games WHERE match_id=$1 AND game_number=$2", match_id, game_number)
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")
    match = await pool.fetchrow(
        "SELECT format_target, format_win_by, status, team_a_id, team_b_id FROM matches WHERE id=$1", match_id
    )
    winner = validate_score_correction(payload.score_a, payload.score_b, match["format_target"], match["format_win_by"])

    if match["status"] in ("completed", "forfeited") and winner is None:
        raise HTTPException(
            status_code=400,
            detail="This match is already completed — the corrected score must still produce a winner for this game.",
        )

    await pool.execute(
        "UPDATE games SET score_a=$1, score_b=$2, winner=$3 WHERE id=$4",
        payload.score_a, payload.score_b, winner, game["id"],
    )
    await pool.execute(
        """INSERT INTO match_events (match_id, event_type, description, created_by)
           VALUES ($1, 'point_correction', $2, $3)""",
        match_id,
        f"Score corrected by {staff['name']}: Game {game_number} {game['score_a']}-{game['score_b']} -> {payload.score_a}-{payload.score_b}",
        staff["id"],
    )

    if match["status"] == "completed":
        games = await pool.fetch("SELECT winner FROM games WHERE match_id=$1", match_id)
        wins_a = sum(1 for g in games if g["winner"] == "a")
        wins_b = sum(1 for g in games if g["winner"] == "b")
        if wins_a == wins_b:
            raise HTTPException(
                status_code=400,
                detail="Correcting this score would leave the match without a determined winner — adjust the other game score(s) too.",
            )
        new_winner_team_id = match["team_a_id"] if wins_a > wins_b else match["team_b_id"]
        await pool.execute(
            "UPDATE matches SET winner_team_id=$1, updated_at=now() WHERE id=$2", new_winner_team_id, match_id
        )

    return await _broadcast_match(pool, match_id, event="score:updated")


@router.post("/{match_id}/next-game")
async def start_next_game(match_id: int, _: dict = Depends(get_current_staff)):
    pool = get_pool()
    last_game = await pool.fetchrow(
        "SELECT * FROM games WHERE match_id=$1 ORDER BY game_number DESC LIMIT 1", match_id
    )
    next_number = (last_game["game_number"] + 1) if last_game else 1
    await pool.execute(
        "INSERT INTO games (match_id, game_number) VALUES ($1, $2)",
        match_id, next_number,
    )
    return await _broadcast_match(pool, match_id, event="score:updated")


@router.post("/{match_id}/complete", response_model=MatchOut)
async def complete_match(match_id: int, _: dict = Depends(get_current_staff)):
    pool = get_pool()
    match = await pool.fetchrow("SELECT * FROM matches WHERE id=$1", match_id)
    games = await pool.fetch("SELECT * FROM games WHERE match_id=$1", match_id)
    wins_a = sum(1 for g in games if g["winner"] == "a")
    wins_b = sum(1 for g in games if g["winner"] == "b")
    winner_team_id = match["team_a_id"] if wins_a > wins_b else match["team_b_id"]

    await pool.execute(
        "UPDATE matches SET status='completed', winner_team_id=$1, completed_at=now(), updated_at=now() WHERE id=$2",
        winner_team_id, match_id,
    )
    if match["court_id"]:
        await pool.execute("UPDATE courts SET status='open', updated_at=now() WHERE id=$1", match["court_id"])
        await emit("court:updated", {"id": match["court_id"]})
    await _advance_stage(pool, match_id)
    await emit("pool:updated", {"pool_id": match["pool_id"]} if match["pool_id"] else {})
    match_out = await _broadcast_match(pool, match_id, event="match:completed")
    if match_out:
        winner_name = match_out.team_a_name if winner_team_id == match_out.team_a_id else match_out.team_b_name
        loser_name = match_out.team_b_name if winner_team_id == match_out.team_a_id else match_out.team_a_name
        await push_notification(pool, f"{winner_name or 'TBD'} defeats {loser_name or 'TBD'}.")
    return match_out


@router.post("/{match_id}/events")
async def add_event(match_id: int, event_type: str, description: str, staff: dict = Depends(get_current_staff)):
    pool = get_pool()
    await pool.execute(
        "INSERT INTO match_events (match_id, event_type, description, created_by) VALUES ($1,$2,$3,$4)",
        match_id, event_type, description, staff["id"],
    )
    return await _broadcast_match(pool, match_id, event="match:updated")


async def _advance_stage(pool, match_id: int):
    match = await pool.fetchrow("SELECT stage FROM matches WHERE id=$1", match_id)
    if match is None:
        return
    if match["stage"] == "league":
        await _maybe_generate_super4(pool)
    elif match["stage"] == "super4":
        await _maybe_generate_final(pool)


async def _team_wins_and_diff(pool, team_id: int, stage: str) -> tuple[int, int]:
    row = await pool.fetchrow(
        """SELECT
             COUNT(*) FILTER (WHERE m.winner_team_id = $1) AS wins,
             COALESCE(SUM(CASE WHEN m.team_a_id = $1 THEN g.points_a ELSE g.points_b END), 0)
               - COALESCE(SUM(CASE WHEN m.team_a_id = $1 THEN g.points_b ELSE g.points_a END), 0) AS point_diff
           FROM matches m
           LEFT JOIN LATERAL (
               SELECT COALESCE(SUM(score_a), 0) AS points_a, COALESCE(SUM(score_b), 0) AS points_b
               FROM games WHERE match_id = m.id
           ) g ON true
           WHERE (m.team_a_id = $1 OR m.team_b_id = $1) AND m.stage = $2
             AND m.status IN ('completed', 'forfeited')""",
        team_id, stage,
    )
    return row["wins"], row["point_diff"]


async def _rank_teams(pool, team_ids: list[int], stage: str) -> list[int]:
    scored = [(tid, *(await _team_wins_and_diff(pool, tid, stage))) for tid in team_ids]
    scored.sort(key=lambda t: (-t[1], -t[2]))
    return [tid for tid, _, _ in scored]


async def _maybe_generate_super4(pool):
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock(1001)")

            already = await conn.fetchval("SELECT COUNT(*) FROM matches WHERE stage='super4'")
            if already:
                return

            pools = await conn.fetch("SELECT id FROM pools ORDER BY label")
            winners = []
            for p in pools:
                league_counts = await conn.fetchrow(
                    """SELECT COUNT(*) AS total,
                              COUNT(*) FILTER (WHERE status IN ('completed','forfeited')) AS done
                       FROM matches WHERE pool_id=$1 AND stage='league'""",
                    p["id"],
                )
                if league_counts["total"] == 0 or league_counts["done"] != league_counts["total"]:
                    return
                team_rows = await conn.fetch(
                    "SELECT id FROM teams WHERE pool_id=$1 AND status='registered'", p["id"]
                )
                ranked = await _rank_teams(conn, [t["id"] for t in team_rows], "league")
                if not ranked:
                    return
                winners.append(ranked[0])

            if len(winners) != 4:
                return

            rounds = _round_robin_rounds(winners)
            for round_num, pairings in enumerate(rounds, start=1):
                for team_a, team_b in pairings:
                    await conn.execute(
                        """INSERT INTO matches (stage, round_label, team_a_id, team_b_id, status,
                                                 format_target, format_win_by, format_best_of)
                           VALUES ('super4', $1, $2, $3, 'unscheduled', 11, 1, 1)""",
                        f"Round {round_num}", team_a, team_b,
                    )
    await emit("match:updated", {})
    await push_notification(pool, "Super 4 lineup is set — top team from each pool has advanced.")


async def _maybe_generate_final(pool):
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock(1002)")

            already = await conn.fetchval("SELECT COUNT(*) FROM matches WHERE stage='final'")
            if already:
                return

            counts = await conn.fetchrow(
                """SELECT COUNT(*) AS total,
                          COUNT(*) FILTER (WHERE status IN ('completed','forfeited')) AS done
                   FROM matches WHERE stage='super4'"""
            )
            if counts["total"] == 0 or counts["done"] != counts["total"]:
                return

            team_rows = await conn.fetch(
                "SELECT DISTINCT team_a_id AS id FROM matches WHERE stage='super4' AND team_a_id IS NOT NULL "
                "UNION SELECT DISTINCT team_b_id FROM matches WHERE stage='super4' AND team_b_id IS NOT NULL"
            )
            ranked = await _rank_teams(conn, [t["id"] for t in team_rows], "super4")
            if len(ranked) < 2:
                return
            team_a, team_b = ranked[0], ranked[1]

            await conn.execute(
                """INSERT INTO matches (stage, round_label, team_a_id, team_b_id, status,
                                         format_target, format_win_by, format_best_of)
                   VALUES ('final', 'Final', $1, $2, 'unscheduled', 11, 2, 3)""",
                team_a, team_b,
            )
    await emit("match:updated", {})
    await push_notification(pool, "The Final matchup is set — top 2 from Super 4 have advanced.")
