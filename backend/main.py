import asyncio
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import anthropic
import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from socket_manager import sio
from routers import chat, workflow, workflows, execution, perception
from models.chat import AI_PERSONAS, ChatMessage, MessageType
from services.conversation_manager import (
    get_state, append_history, add_history_log,
)
from services.orchestrator_agent import route_message
from services.clarifier_agent import clarify
from services.workflow_designer import design_workflow
from services.workflow_db import save_workflow
from services.execution_control import execution_control
from services.observability.logger import log_event
from services.harness import save_session_checkpoint
from database import init_db, shutdown_db
from routers.execution import KillSessionRequest, kill_session

_anthropic_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)


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
app.include_router(chat.sessions_router, prefix="/api")
app.include_router(workflow.router, prefix="/api")
app.include_router(workflows.router, prefix="/api")
app.include_router(execution.router, prefix="/api")
app.include_router(perception.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ── Socket.io helpers ────────────────────────────────────────────────────────
async def _stream_casual_reply(user_msg: str, history: list, session_id: str) -> None:
    msg_id = f"msg_{uuid.uuid4().hex[:8]}"
    await sio.emit("chat:stream_start", {"message_id": msg_id, "sender": "claude"}, room=session_id)
    full = ""
    try:
        async with _anthropic_client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=512,
            system="You are OrchestrAI, a helpful AI workflow assistant. Reply conversationally. Match the user's language (Chinese or English).",
            messages=history + [{"role": "user", "content": user_msg}],
        ) as stream:
            async for token in stream.text_stream:
                full += token
                await sio.emit("chat:stream_token", {"message_id": msg_id, "token": token}, room=session_id)
    except Exception:
        full = "抱歉，发生了错误，请重试。"
        await sio.emit("chat:stream_token", {"message_id": msg_id, "token": full}, room=session_id)
    await sio.emit("chat:stream_end", {"message_id": msg_id, "content": full}, room=session_id)
    append_history(session_id, "assistant", full)


# ── Socket.io events ─────────────────────────────────────────────────────────
@sio.event
async def chat_send(sid, data):
    content: str = data.get("content", "").strip()
    session_id: str = data.get("session_id", "default")
    if not content:
        return

    log_event(
        event_type="chat_message_received",
        session_id=session_id,
        agent="orchestrator",
        payload={"sid": sid, "content_length": len(content)},
    )

    # Echo user message to room
    await sio.emit(
        "chat:message",
        ChatMessage(
            message_id=f"msg_{uuid.uuid4().hex[:8]}",
            sender=AI_PERSONAS["orchestrai"],
            content=content,
            message_type=MessageType.text,
            timestamp=datetime.now(timezone.utc).isoformat(),
        ).model_dump(),
        room=session_id,
    )

    state = get_state(session_id)
    execution_control.clear_session_kill(session_id)
    if state.state == "cancelled":
        state.state = "idle"  # type: ignore[assignment]
    append_history(session_id, "user", content)
    add_history_log(session_id, "用户消息", content[:80])

    if state.state == "idle":
        route_result = await route_message(content, state.history[-6:])
        log_event(
            event_type="message_routed",
            session_id=session_id,
            agent="orchestrator",
            payload={"route": route_result.get("route")},
        )
        if route_result.get("route") == "development_request":
            state.state = "clarifying"
            state.original_request = content
            await clarify(session_id, content, state, sio.emit)
        else:
            await _stream_casual_reply(content, state.history[-10:], session_id)
        await save_session_checkpoint(session_id, state, resumable=True)

    elif state.state == "clarifying":
        await clarify(session_id, content, state, sio.emit)
        await save_session_checkpoint(session_id, state, resumable=True)

    elif state.state == "awaiting_confirm":
        # User adds more context → backtrack to clarifying
        state.state = "clarifying"
        await clarify(session_id, content, state, sio.emit)
        await save_session_checkpoint(session_id, state, resumable=True)

    elif state.state in ("generating", "complete"):
        await _stream_casual_reply(content, state.history[-10:], session_id)
        await save_session_checkpoint(session_id, state, resumable=True)


@sio.event
async def chat_confirm_start(sid, data):
    session_id: str = data.get("session_id", "default")
    state = get_state(session_id)
    if state.state != "awaiting_confirm":
        return

    state.state = "generating"
    add_history_log(session_id, "用户确认", "开始生成工作流")
    await save_session_checkpoint(session_id, state, resumable=True)

    workflow = await design_workflow(session_id, state, sio.emit)
    if not workflow:
        return

    try:
        await save_workflow(workflow, session_id)
    except Exception as e:
        log_event(
            event_type="workflow_save_failed",
            session_id=session_id,
            workflow_id=workflow.workflow_id,
            agent="workflow_designer",
            payload={"error_type": type(e).__name__, "error": str(e)},
        )
        await sio.emit(
            "building:log",
            {
                "log_id": f"log_{uuid.uuid4().hex[:8]}",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "type": "error",
                "message": f"保存工作流失败: {type(e).__name__}",
                "detail": str(e)[:200],
                "agent": "Workflow Designer",
            },
            room=session_id,
        )
        return

    state.state = "complete"
    add_history_log(session_id, "工作流生成", f"{workflow.title}（{len(workflow.nodes)} 个节点）")
    await save_session_checkpoint(session_id, state, resumable=False)
    log_event(
        event_type="workflow_ready",
        session_id=session_id,
        workflow_id=workflow.workflow_id,
        agent="workflow_designer",
        payload={"title": workflow.title, "node_count": len(workflow.nodes)},
    )
    await sio.emit(
        "workflow:ready",
        {"workflow_id": workflow.workflow_id, "title": workflow.title, "node_count": len(workflow.nodes)},
        room=session_id,
    )
    await sio.emit(
        "history:update",
        {"entries": state.history_log},
        room=session_id,
    )


@sio.on("execution:kill")
async def execution_kill(sid, data):
    await kill_session(
        KillSessionRequest(
            session_id=data.get("session_id", "default"),
            reason=data.get("reason", "user_requested"),
        )
    )


# ── ASGI mount ───────────────────────────────────────────────────────────────
# Wrap FastAPI with Socket.io ASGI app
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
