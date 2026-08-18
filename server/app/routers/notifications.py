from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.db import get_pool
from app.security import get_current_staff
from app.sockets import emit

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class NotificationIn(BaseModel):
    message: str
    level: str = "info"


class NotificationOut(BaseModel):
    id: int
    message: str
    level: str
    created_at: str


async def _current_notifications(pool) -> list[NotificationOut]:
    rows = await pool.fetch("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 3")
    return [
        NotificationOut(id=r["id"], message=r["message"], level=r["level"], created_at=r["created_at"].isoformat())
        for r in rows
    ]


async def push_notification(pool, message: str, level: str = "info") -> None:
    await pool.execute("INSERT INTO notifications (message, level) VALUES ($1, $2)", message, level)
    await pool.execute(
        "DELETE FROM notifications WHERE id NOT IN (SELECT id FROM notifications ORDER BY created_at DESC LIMIT 3)"
    )
    await emit("notification:new", {})


@router.get("", response_model=list[NotificationOut])
async def list_notifications():
    pool = get_pool()
    return await _current_notifications(pool)


@router.post("", response_model=list[NotificationOut], status_code=201)
async def create_notification(payload: NotificationIn, _: dict = Depends(get_current_staff)):
    pool = get_pool()
    await push_notification(pool, payload.message, payload.level)
    return await _current_notifications(pool)
