import asyncpg
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.db import get_pool
from app.security import get_current_staff, require_director
from app.sockets import emit

router = APIRouter(prefix="/api/courts", tags=["courts"])


class CourtCreate(BaseModel):
    label: str


class CourtPatch(BaseModel):
    status: str | None = None
    note: str | None = None
    label: str | None = None


class CourtOut(BaseModel):
    id: int
    label: str
    status: str
    note: str | None = None
    current_match_id: int | None = None


@router.get("", response_model=list[CourtOut])
async def list_courts():
    pool = get_pool()
    rows = await pool.fetch(
        """SELECT c.id, c.label, c.status, c.note,
                  (SELECT m.id FROM matches m WHERE m.court_id = c.id AND m.status = 'live' LIMIT 1) AS current_match_id
           FROM courts c ORDER BY c.label"""
    )
    return [CourtOut(**dict(r)) for r in rows]


@router.post("", response_model=CourtOut, status_code=201)
async def create_court(payload: CourtCreate, _: dict = Depends(require_director)):
    pool = get_pool()
    label = payload.label.strip()
    if not label:
        raise HTTPException(status_code=422, detail="Court label is required")
    try:
        row = await pool.fetchrow(
            "INSERT INTO courts (label) VALUES ($1) RETURNING id, label, status, note",
            label,
        )
    except asyncpg.UniqueViolationError:
        raise HTTPException(status_code=409, detail=f'A court named "{label}" already exists')
    await emit("court:updated", {"id": row["id"]})
    return CourtOut(**dict(row), current_match_id=None)


@router.delete("/{court_id}", status_code=204)
async def delete_court(court_id: int, _: dict = Depends(require_director)):
    pool = get_pool()
    existing = await pool.fetchrow("SELECT id FROM courts WHERE id=$1", court_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Court not found")

    live_match = await pool.fetchrow(
        "SELECT id FROM matches WHERE court_id=$1 AND status='live' LIMIT 1", court_id
    )
    if live_match is not None:
        raise HTTPException(status_code=400, detail="Cannot remove a court with a live match. Complete or reassign the match first.")

    await pool.execute("DELETE FROM courts WHERE id=$1", court_id)
    await emit("court:updated", {"id": court_id})


@router.patch("/{court_id}", response_model=CourtOut)
async def update_court(court_id: int, payload: CourtPatch, _: dict = Depends(get_current_staff)):
    pool = get_pool()
    existing = await pool.fetchrow("SELECT * FROM courts WHERE id=$1", court_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Court not found")

    fields = payload.model_dump(exclude_unset=True)
    updated = dict(existing) | fields

    row = await pool.fetchrow(
        """UPDATE courts SET label=$1, status=$2, note=$3, updated_at=now() WHERE id=$4
           RETURNING id, label, status, note""",
        updated["label"], updated["status"], updated["note"], court_id,
    )
    await emit("court:updated", {"id": court_id})
    return CourtOut(**dict(row), current_match_id=None)
