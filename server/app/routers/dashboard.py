from fastapi import APIRouter

from app.db import get_pool

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/overview")
async def get_overview():
    pool = get_pool()

    stats = await pool.fetchrow(
        """SELECT
             COUNT(*) AS total_matches,
             COUNT(*) FILTER (WHERE status = 'live') AS live_now,
             COUNT(*) FILTER (WHERE status = 'completed') AS completed
           FROM matches"""
    )
    team_stats = await pool.fetchrow(
        """SELECT COUNT(*) AS registered
           FROM teams WHERE status = 'registered'"""
    )

    courts = await pool.fetch(
        """SELECT c.id, c.label, c.status, c.note,
                  m.id AS match_id, ta.name AS team_a_name, tb.name AS team_b_name,
                  m.scheduled_time
           FROM courts c
           LEFT JOIN matches m ON m.court_id = c.id AND m.status IN ('live', 'upcoming')
           LEFT JOIN teams ta ON ta.id = m.team_a_id
           LEFT JOIN teams tb ON tb.id = m.team_b_id
           ORDER BY c.label"""
    )

    ready_queue = await pool.fetch(
        """SELECT m.id, m.round_label, ta.name AS team_a_name, tb.name AS team_b_name, p.label AS pool_label
           FROM matches m
           JOIN teams ta ON ta.id = m.team_a_id
           JOIN teams tb ON tb.id = m.team_b_id
           LEFT JOIN pools p ON p.id = m.pool_id
           WHERE m.court_id IS NULL AND m.status IN ('unscheduled', 'upcoming')
           ORDER BY m.created_at
           LIMIT 20"""
    )

    alerts = []
    delayed_courts = await pool.fetch("SELECT label, note FROM courts WHERE status = 'delayed'")
    for c in delayed_courts:
        alerts.append({"level": "warning", "message": f"{c['label']} delayed — {c['note'] or 'no reason given'}"})

    if ready_queue:
        alerts.append({"level": "info", "message": f"{len(ready_queue)} match(es) ready to start"})

    return {
        "stats": {
            "total_matches": stats["total_matches"],
            "live_now": stats["live_now"],
            "completed": stats["completed"],
            "teams_registered": team_stats["registered"],
        },
        "courts": [dict(c) | {"scheduled_time": c["scheduled_time"].isoformat() if c["scheduled_time"] else None} for c in courts],
        "ready_queue": [dict(r) for r in ready_queue],
        "alerts": alerts,
    }
