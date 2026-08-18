import socketio

from app.config import get_settings

settings = get_settings()

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=settings.cors_origins,
)


async def emit(event: str, data: dict) -> None:
    await sio.emit(event, data)
