from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.db import get_pool
from app.security import get_current_staff
from app.sockets import emit

router = APIRouter(prefix="/api/settings", tags=["settings"])


class TimelineBlockIn(BaseModel):
    label: str
    start_time: datetime
    end_time: datetime


class TimelineBlockOut(TimelineBlockIn):
    id: int


class SettingsOut(BaseModel):
    values: dict
    timeline: list[TimelineBlockOut]


@router.get("", response_model=SettingsOut)
async def get_settings_data():
    pool = get_pool()
    rows = await pool.fetch("SELECT key, value FROM settings")
    values = {r["key"]: r["value"] for r in rows}
    timeline_rows = await pool.fetch("SELECT * FROM timeline_blocks ORDER BY sort_order")
    timeline = [
        TimelineBlockOut(id=r["id"], label=r["label"], start_time=r["start_time"], end_time=r["end_time"])
        for r in timeline_rows
    ]
    return SettingsOut(values=values, timeline=timeline)


@router.patch("", response_model=dict)
async def update_settings(payload: dict, _: dict = Depends(get_current_staff)):
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            for key, value in payload.items():
                await conn.execute(
                    """INSERT INTO settings (key, value) VALUES ($1, $2)
                       ON CONFLICT (key) DO UPDATE SET value = $2""",
                    key, value,
                )
    await emit("settings:updated", {})
    return payload


@router.put("/timeline", response_model=list[TimelineBlockOut])
async def replace_timeline(blocks: list[TimelineBlockIn], _: dict = Depends(get_current_staff)):
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("DELETE FROM timeline_blocks")
            rows = []
            for idx, block in enumerate(blocks):
                row = await conn.fetchrow(
                    """INSERT INTO timeline_blocks (label, start_time, end_time, sort_order)
                       VALUES ($1,$2,$3,$4) RETURNING *""",
                    block.label, block.start_time, block.end_time, idx,
                )
                rows.append(row)
    await emit("settings:updated", {})
    return [
        TimelineBlockOut(id=r["id"], label=r["label"], start_time=r["start_time"], end_time=r["end_time"])
        for r in rows
    ]
