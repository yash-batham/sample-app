from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.db import get_pool
from app.security import get_current_staff
from app.sockets import emit

router = APIRouter(prefix="/api/teams", tags=["teams"])

TEAM_RECORD_SQL = """
    SELECT
      COUNT(*) FILTER (WHERE m.winner_team_id = t.id) AS wins,
      COUNT(*) FILTER (WHERE m.status IN ('completed','forfeited') AND m.winner_team_id IS NOT NULL AND m.winner_team_id != t.id) AS losses
    FROM matches m
    WHERE (m.team_a_id = t.id OR m.team_b_id = t.id) AND m.status IN ('completed', 'forfeited')
"""


class TeamIn(BaseModel):
    name: str
    player1_name: str
    player1_phone: str | None = None
    player1_email: str | None = None
    player2_name: str
    player2_phone: str | None = None
    player2_email: str | None = None
    seed: int | None = None
    rating: float | None = None
    pool_id: int | None = None


class TeamPatch(BaseModel):
    name: str | None = None
    player1_name: str | None = None
    player1_phone: str | None = None
    player1_email: str | None = None
    player2_name: str | None = None
    player2_phone: str | None = None
    player2_email: str | None = None
    seed: int | None = None
    rating: float | None = None
    pool_id: int | None = None
    status: str | None = None


class TeamOut(BaseModel):
    id: int
    name: str
    player1_name: str
    player1_phone: str | None = None
    player1_email: str | None = None
    player2_name: str
    player2_phone: str | None = None
    player2_email: str | None = None
    seed: int | None = None
    rating: float | None = None
    pool_id: int | None = None
    pool_label: str | None = None
    status: str
    wins: int = 0
    losses: int = 0


def _row_to_team(row: dict) -> TeamOut:
    return TeamOut(**dict(row))


@router.get("", response_model=list[TeamOut])
async def list_teams(
    pool_id: int | None = None,
    search: str | None = None,
):
    pool = get_pool()
    query = f"""
        SELECT t.*, p.label AS pool_label,
               COALESCE(rec.wins, 0) AS wins, COALESCE(rec.losses, 0) AS losses
        FROM teams t
        LEFT JOIN pools p ON p.id = t.pool_id
        LEFT JOIN LATERAL ({TEAM_RECORD_SQL}) rec ON true
        WHERE 1=1
    """
    args: list = []
    if pool_id is not None:
        args.append(pool_id)
        query += f" AND t.pool_id = ${len(args)}"
    if search:
        args.append(f"%{search}%")
        query += f" AND (t.name ILIKE ${len(args)} OR t.player1_name ILIKE ${len(args)} OR t.player2_name ILIKE ${len(args)})"
    query += " ORDER BY p.label NULLS LAST, t.seed NULLS LAST, t.name"

    rows = await pool.fetch(query, *args)
    return [_row_to_team(r) for r in rows]


@router.get("/{team_id}", response_model=TeamOut)
async def get_team(team_id: int):
    pool = get_pool()
    row = await pool.fetchrow(
        f"""
        SELECT t.*, p.label AS pool_label,
               COALESCE(rec.wins, 0) AS wins, COALESCE(rec.losses, 0) AS losses
        FROM teams t
        LEFT JOIN pools p ON p.id = t.pool_id
        LEFT JOIN LATERAL ({TEAM_RECORD_SQL}) rec ON true
        WHERE t.id = $1
        """,
        team_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Team not found")
    return _row_to_team(row)


@router.post("", response_model=TeamOut, status_code=201)
async def create_team(payload: TeamIn, _: dict = Depends(get_current_staff)):
    pool = get_pool()
    row = await pool.fetchrow(
        """INSERT INTO teams (name, player1_name, player1_phone, player1_email,
                               player2_name, player2_phone, player2_email, seed, rating, pool_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING *""",
        payload.name, payload.player1_name, payload.player1_phone, payload.player1_email,
        payload.player2_name, payload.player2_phone, payload.player2_email,
        payload.seed, payload.rating, payload.pool_id,
    )
    await emit("team:updated", {"id": row["id"]})
    return _row_to_team(dict(row) | {"pool_label": None, "wins": 0, "losses": 0})


@router.patch("/{team_id}", response_model=TeamOut)
async def update_team(team_id: int, payload: TeamPatch, _: dict = Depends(get_current_staff)):
    pool = get_pool()
    existing = await pool.fetchrow("SELECT * FROM teams WHERE id=$1", team_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Team not found")

    fields = payload.model_dump(exclude_unset=True)
    updated = dict(existing) | fields

    row = await pool.fetchrow(
        """UPDATE teams SET name=$1, player1_name=$2, player1_phone=$3, player1_email=$4,
                             player2_name=$5, player2_phone=$6, player2_email=$7,
                             seed=$8, rating=$9, pool_id=$10, status=$11
           WHERE id=$12 RETURNING *""",
        updated["name"], updated["player1_name"], updated["player1_phone"], updated["player1_email"],
        updated["player2_name"], updated["player2_phone"], updated["player2_email"],
        updated["seed"], updated["rating"], updated["pool_id"],
        updated["status"], team_id,
    )
    pool_label = None
    if row["pool_id"] is not None:
        pool_label = await pool.fetchval("SELECT label FROM pools WHERE id=$1", row["pool_id"])
    await emit("team:updated", {"id": team_id})
    return _row_to_team(dict(row) | {"pool_label": pool_label, "wins": 0, "losses": 0})


@router.delete("/{team_id}", status_code=204)
async def delete_team(team_id: int, _: dict = Depends(get_current_staff)):
    pool = get_pool()
    await pool.execute("DELETE FROM teams WHERE id=$1", team_id)
    await emit("team:updated", {"id": team_id})
