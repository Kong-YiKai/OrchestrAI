import asyncio
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from socket_manager import sio
from routers import chat, workflow, execution
from models.chat import AI_PERSONAS, ChatMessage, MessageType
from services.orchestrator import generate_workflow_and_respond
from services.multi_ai import fan_out_ai_comments
from services.workflow_db import save_workflow
from database import init_db, shutdown_db


# ── Lifespan ────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    await shutdown_db()


# ── FastAPI app ──────────────────────────────────────────────────────────────
app = FastAPI(title="OrchestrAI API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router, prefix="/api")
app.include_router(workflow.router, prefix="/api")
app.include_router(execution.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ── Socket.io events ─────────────────────────────────────────────────────────
@sio.event
async def chat_send(sid, data):
    """
    Main Socket.io event: user sends a message.
    data = {content: str, session_id: str}
    """
    content: str = data.get("content", "").strip()
    session_id: str = data.get("session_id", "default")

    if not content:
        return

    # Echo user message back to room
    user_message_id = f"msg_{uuid.uuid4().hex[:8]}"
    await sio.emit(
        "chat:message",
        ChatMessage(
            message_id=user_message_id,
            sender=AI_PERSONAS["orchestrai"],
            content=content,
            message_type=MessageType.text,
            timestamp=datetime.now(timezone.utc).isoformat(),
        ).model_dump(),
        room=session_id,
    )

    # Generate workflow + respond (this streams Claude's tokens)
    wf = await generate_workflow_and_respond(content, session_id)

    # Persist workflow and fan out AI comments in background
    if wf:
        await save_workflow(wf, session_id)
        asyncio.create_task(fan_out_ai_comments(wf, content, session_id))


# ── ASGI mount ───────────────────────────────────────────────────────────────
# Wrap FastAPI with Socket.io ASGI app
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
