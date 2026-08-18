from contextlib import asynccontextmanager

import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import db
from app.config import get_settings
from app.sockets import sio
from app.routers import auth, staff, pools, courts, teams, matches, standings, settings, dashboard, match_formats, notifications


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.connect()
    yield
    await db.disconnect()


app = FastAPI(title="Summer Smash Pickleball Championship API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(staff.router)
app.include_router(pools.router)
app.include_router(courts.router)
app.include_router(teams.router)
app.include_router(matches.router)
app.include_router(standings.router)
app.include_router(settings.router)
app.include_router(dashboard.router)
app.include_router(match_formats.router)
app.include_router(notifications.router)

socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
