import uuid
from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel

from models.chat import AI_PERSONAS, ChatMessage, MessageType
from socket_manager import sio

router = APIRouter(prefix="/chat", tags=["chat"])


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
