import socketio
from services.observability.logger import log_event

# Single Socket.io async server instance used across the app
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False,
)

# In-memory session store: session_id -> set of socket ids
sessions: dict[str, set] = {}


@sio.event
async def connect(sid, environ):
    log_event(event_type="socket_connected", agent="socket", payload={"sid": sid})


@sio.event
async def disconnect(sid):
    log_event(event_type="socket_disconnected", agent="socket", payload={"sid": sid})
    # Remove from any sessions
    for session_id, sids in list(sessions.items()):
        sids.discard(sid)


@sio.event
async def join_session(sid, data):
    session_id = data.get("session_id", "default")
    await sio.enter_room(sid, session_id)
    sessions.setdefault(session_id, set()).add(sid)
    log_event(
        event_type="socket_session_joined",
        session_id=session_id,
        agent="socket",
        payload={"sid": sid},
    )
    await sio.emit("session_joined", {"session_id": session_id}, to=sid)
