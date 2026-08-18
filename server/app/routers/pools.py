from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.db import get_pool
from app.security import get_current_staff, require_director
from app.sockets import emit

router = APIRouter(prefix="/api/pools", tags=["pools"])


class PoolIn(BaseModel):
    label: str


class PoolOut(BaseModel):
    id: int
    label: str
    team_count: int


@router.get("", response_model=list[PoolOut])
async def list_pools():
    pool = get_pool()
    rows = await pool.fetch(
        """SELECT p.id, p.label, COUNT(t.id) AS team_count
           FROM pools p LEFT JOIN teams t ON t.pool_id = p.id AND t.status = 'registered'
           GROUP BY p.id, p.label ORDER BY p.label"""
    )
    return [PoolOut(**dict(r)) for r in rows]


@router.post("", response_model=PoolOut, status_code=201)
async def create_pool(payload: PoolIn, _: dict = Depends(get_current_staff)):
    pool = get_pool()
    try:
        row = await pool.fetchrow("INSERT INTO pools (label) VALUES ($1) RETURNING id, label", payload.label)
    except Exception:
        raise HTTPException(status_code=409, detail="A pool with this label already exists")
    await emit("pool:updated", {"id": row["id"]})
    return PoolOut(id=row["id"], label=row["label"], team_count=0)


@router.patch("/{pool_id}", response_model=PoolOut)
async def rename_pool(pool_id: int, payload: PoolIn, _: dict = Depends(get_current_staff)):
    pool = get_pool()
    row = await pool.fetchrow("UPDATE pools SET label=$1 WHERE id=$2 RETURNING id, label", payload.label, pool_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Pool not found")
    count = await pool.fetchval("SELECT COUNT(*) FROM teams WHERE pool_id=$1", pool_id)
    await emit("pool:updated", {"id": pool_id})
    return PoolOut(id=row["id"], label=row["label"], team_count=count)


@router.delete("/{pool_id}", status_code=204)
async def delete_pool(pool_id: int, _: dict = Depends(get_current_staff)):
    pool = get_pool()
    count = await pool.fetchval("SELECT COUNT(*) FROM teams WHERE pool_id=$1", pool_id)
    if count:
        raise HTTPException(status_code=400, detail="Cannot delete a pool with teams assigned")
    await pool.execute("DELETE FROM pools WHERE id=$1", pool_id)
    await emit("pool:updated", {"id": pool_id})


@router.post("/generate-league", status_code=201)
async def generate_league(_: dict = Depends(require_director)):
    """One-time generation of the 16-team League round robin: 4 pools of 4, 6 matches each."""
    pool = get_pool()

    existing = await pool.fetchval("SELECT COUNT(*) FROM matches WHERE stage='league'")
    if existing:
        raise HTTPException(status_code=409, detail="League matches have already been generated")

    pools = await pool.fetch("SELECT id, label FROM pools ORDER BY label")
    if len(pools) != 4:
        raise HTTPException(
            status_code=400, detail=f"Expected exactly 4 pools, found {len(pools)}"
        )

    pool_teams: dict[int, list[int]] = {}
    problems = []
    for p in pools:
        teams = await pool.fetch(
            "SELECT id FROM teams WHERE pool_id=$1 AND status='registered' ORDER BY seed NULLS LAST", p["id"]
        )
        team_ids = [t["id"] for t in teams]
        pool_teams[p["id"]] = team_ids
        if len(team_ids) != 4:
            problems.append(f"Pool {p['label']} has {len(team_ids)} team(s), expected 4")
    if problems:
        raise HTTPException(status_code=400, detail="; ".join(problems))

    created = 0
    async with pool.acquire() as conn:
        async with conn.transaction():
            for p in pools:
                team_ids = pool_teams[p["id"]]
                rounds = _round_robin_rounds(team_ids)
                for round_num, pairings in enumerate(rounds, start=1):
                    for team_a, team_b in pairings:
                        await conn.execute(
                            """INSERT INTO matches (stage, round_label, pool_id, team_a_id, team_b_id, status,
                                                     format_target, format_win_by, format_best_of)
                               VALUES ('league', $1, $2, $3, $4, 'unscheduled', 11, 1, 1)""",
                            f"Round {round_num}", p["id"], team_a, team_b,
                        )
                        created += 1

    await emit("match:updated", {})
    return {"matches_created": created}


def _round_robin_rounds(team_ids: list[int]) -> list[list[tuple[int, int]]]:
    """Standard circle-method round-robin scheduling; adds a bye slot for odd counts."""
    ids = list(team_ids)
    bye = None
    if len(ids) % 2 == 1:
        bye = object()
        ids.append(bye)

    n = len(ids)
    rounds: list[list[tuple[int, int]]] = []
    fixed, rotating = ids[0], ids[1:]
    for _ in range(n - 1):
        current = [fixed] + rotating
        pairings = []
        for i in range(n // 2):
            a, b = current[i], current[n - 1 - i]
            if a is not bye and b is not bye:
                pairings.append((a, b))
        rounds.append(pairings)
        rotating = rotating[1:] + rotating[:1]
    return rounds
