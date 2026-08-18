from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db import get_pool

router = APIRouter(prefix="/api/standings", tags=["standings"])


class TeamStanding(BaseModel):
    team_id: int
    team_name: str
    wins: int
    losses: int
    games_won: int
    games_lost: int
    points_for: int
    points_against: int
    point_diff: int
    rank: int
    is_qualifying: bool
    tiebreak_note: str | None = None


class PoolStandings(BaseModel):
    pool_id: int
    pool_label: str
    total_matches: int
    completed_matches: int
    teams: list[TeamStanding]


STANDINGS_SQL = """
    SELECT
      t.id AS team_id, t.name AS team_name,
      COUNT(*) FILTER (WHERE m.winner_team_id = t.id) AS wins,
      COUNT(*) FILTER (WHERE m.winner_team_id IS NOT NULL AND m.winner_team_id != t.id) AS losses,
      COALESCE(SUM(CASE WHEN m.team_a_id = t.id THEN g.games_a ELSE g.games_b END), 0) AS games_won,
      COALESCE(SUM(CASE WHEN m.team_a_id = t.id THEN g.games_b ELSE g.games_a END), 0) AS games_lost,
      COALESCE(SUM(CASE WHEN m.team_a_id = t.id THEN g.points_a ELSE g.points_b END), 0) AS points_for,
      COALESCE(SUM(CASE WHEN m.team_a_id = t.id THEN g.points_b ELSE g.points_a END), 0) AS points_against
    FROM teams t
    LEFT JOIN matches m ON (m.team_a_id = t.id OR m.team_b_id = t.id)
        AND m.pool_id = t.pool_id AND m.stage = 'league' AND m.status IN ('completed', 'forfeited')
    LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE winner = 'a') AS games_a,
          COUNT(*) FILTER (WHERE winner = 'b') AS games_b,
          COALESCE(SUM(score_a), 0) AS points_a,
          COALESCE(SUM(score_b), 0) AS points_b
        FROM games WHERE match_id = m.id
    ) g ON true
    WHERE t.pool_id = $1 AND t.status = 'registered'
    GROUP BY t.id, t.name
"""


async def _pool_standings(pool, pool_row) -> PoolStandings:
    rows = await pool.fetch(STANDINGS_SQL, pool_row["id"])
    match_counts = await pool.fetchrow(
        """SELECT COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE status IN ('completed','forfeited')) AS completed
           FROM matches WHERE pool_id=$1 AND stage='league'""",
        pool_row["id"],
    )

    teams = _rank_and_annotate(rows, qualifying_count=1)

    return PoolStandings(
        pool_id=pool_row["id"], pool_label=pool_row["label"],
        total_matches=match_counts["total"], completed_matches=match_counts["completed"],
        teams=teams,
    )


def _rank_and_annotate(rows, qualifying_count: int) -> list[TeamStanding]:
    teams = sorted(
        (dict(r) | {"point_diff": r["points_for"] - r["points_against"]} for r in rows),
        key=lambda t: (-t["wins"], -t["point_diff"]),
    )

    standings = []
    for idx, team in enumerate(teams):
        note = None
        if idx > 0:
            prev = teams[idx - 1]
            if prev["wins"] == team["wins"] and prev["point_diff"] == team["point_diff"]:
                note = "Tiebreak: head-to-head"
        standings.append(
            TeamStanding(
                team_id=team["team_id"], team_name=team["team_name"],
                wins=team["wins"], losses=team["losses"],
                games_won=team["games_won"], games_lost=team["games_lost"],
                points_for=team["points_for"], points_against=team["points_against"],
                point_diff=team["point_diff"], rank=idx + 1, is_qualifying=idx < qualifying_count,
                tiebreak_note=note,
            )
        )
    return standings


STAGE_STANDINGS_SQL = """
    SELECT
      t.id AS team_id, t.name AS team_name,
      COUNT(*) FILTER (WHERE m.winner_team_id = t.id) AS wins,
      COUNT(*) FILTER (WHERE m.winner_team_id IS NOT NULL AND m.winner_team_id != t.id) AS losses,
      COALESCE(SUM(CASE WHEN m.team_a_id = t.id THEN g.games_a ELSE g.games_b END), 0) AS games_won,
      COALESCE(SUM(CASE WHEN m.team_a_id = t.id THEN g.games_b ELSE g.games_a END), 0) AS games_lost,
      COALESCE(SUM(CASE WHEN m.team_a_id = t.id THEN g.points_a ELSE g.points_b END), 0) AS points_for,
      COALESCE(SUM(CASE WHEN m.team_a_id = t.id THEN g.points_b ELSE g.points_a END), 0) AS points_against
    FROM teams t
    LEFT JOIN matches m ON (m.team_a_id = t.id OR m.team_b_id = t.id)
        AND m.stage = $2 AND m.status IN ('completed', 'forfeited')
    LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE winner = 'a') AS games_a,
          COUNT(*) FILTER (WHERE winner = 'b') AS games_b,
          COALESCE(SUM(score_a), 0) AS points_a,
          COALESCE(SUM(score_b), 0) AS points_b
        FROM games WHERE match_id = m.id
    ) g ON true
    WHERE t.id = ANY($1::int[])
    GROUP BY t.id, t.name
"""


async def _stage_standings(pool, team_ids: list[int], stage: str) -> list[TeamStanding]:
    if not team_ids:
        return []
    rows = await pool.fetch(STAGE_STANDINGS_SQL, team_ids, stage)
    return _rank_and_annotate(rows, qualifying_count=2)


@router.get("/pools", response_model=list[PoolStandings])
async def all_pool_standings():
    pool = get_pool()
    pools = await pool.fetch("SELECT id, label FROM pools ORDER BY label")
    return [await _pool_standings(pool, p) for p in pools]


@router.get("/pools/{pool_id}", response_model=PoolStandings)
async def one_pool_standings(pool_id: int):
    pool = get_pool()
    pool_row = await pool.fetchrow("SELECT id, label FROM pools WHERE id=$1", pool_id)
    if pool_row is None:
        raise HTTPException(status_code=404, detail="Pool not found")
    return await _pool_standings(pool, pool_row)


class StageStandings(BaseModel):
    stage: str
    total_matches: int
    completed_matches: int
    teams: list[TeamStanding]


@router.get("/super4", response_model=StageStandings)
async def super4_standings():
    pool = get_pool()
    team_rows = await pool.fetch(
        "SELECT DISTINCT team_a_id AS id FROM matches WHERE stage='super4' AND team_a_id IS NOT NULL "
        "UNION SELECT DISTINCT team_b_id FROM matches WHERE stage='super4' AND team_b_id IS NOT NULL"
    )
    team_ids = [r["id"] for r in team_rows]
    match_counts = await pool.fetchrow(
        """SELECT COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE status IN ('completed','forfeited')) AS completed
           FROM matches WHERE stage='super4'"""
    )
    teams = await _stage_standings(pool, team_ids, "super4")
    return StageStandings(
        stage="super4", total_matches=match_counts["total"], completed_matches=match_counts["completed"],
        teams=teams,
    )
