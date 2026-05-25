import uuid
from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel

from models.chat import AI_PERSONAS, ChatMessage, MessageType
from socket_manager import sio
from services.conversation_manager import restore_state, state_to_dict
from services.harness import load_session_checkpoint

router = APIRouter(prefix="/chat", tags=["chat"])
sessions_router = APIRouter(prefix="/sessions", tags=["sessions"])


class SendMessageRequest(BaseModel):
    content: str
    session_id: str = "default"


@router.post("/message")
async def send_message(req: SendMessageRequest):
    """
    HTTP endpoint as fallback. Main flow goes through Socket.io chat:send event.
    """
    message_id = f"msg_{uuid.uuid4().hex[:8]}"
    user_msg = ChatMessage(
        message_id=message_id,
        sender=AI_PERSONAS["orchestrai"],
        content=req.content,
        message_type=MessageType.text,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
    await sio.emit("chat:message", user_msg.model_dump(), room=req.session_id)
    return {"status": "ok", "message_id": message_id}


@sessions_router.post("/{session_id}/resume")
async def resume_session(session_id: str):
    state = await load_session_checkpoint(session_id)
    if state is None:
        return {"status": "not_found", "session_id": session_id, "state": None}
    restore_state(session_id, state)
    return {
        "status": "resumed",
        "session_id": session_id,
        "state": state_to_dict(state),
    }
