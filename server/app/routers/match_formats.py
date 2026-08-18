from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.db import get_pool
from app.security import get_current_staff, require_director
from app.sockets import emit

router = APIRouter(prefix="/api/match-formats", tags=["match-formats"])


class MatchFormatIn(BaseModel):
    label: str
    target_score: int
    win_by: int
    best_of: int


class MatchFormatOut(MatchFormatIn):
    id: int


@router.get("", response_model=list[MatchFormatOut])
async def list_match_formats(_: dict = Depends(get_current_staff)):
    pool = get_pool()
    rows = await pool.fetch("SELECT * FROM match_formats ORDER BY id")
    return [MatchFormatOut(**dict(r)) for r in rows]


@router.post("", response_model=MatchFormatOut, status_code=201)
async def create_match_format(payload: MatchFormatIn, _: dict = Depends(require_director)):
    pool = get_pool()
    row = await pool.fetchrow(
        """INSERT INTO match_formats (label, target_score, win_by, best_of)
           VALUES ($1, $2, $3, $4) RETURNING *""",
        payload.label, payload.target_score, payload.win_by, payload.best_of,
    )
    await emit("match_format:updated", {})
    return MatchFormatOut(**dict(row))


@router.delete("/{format_id}", status_code=204)
async def delete_match_format(format_id: int, _: dict = Depends(require_director)):
    pool = get_pool()
    await pool.execute("DELETE FROM match_formats WHERE id=$1", format_id)
    await emit("match_format:updated", {})
