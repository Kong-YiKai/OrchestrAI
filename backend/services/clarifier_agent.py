import json
import re
import uuid
from pathlib import Path
import anthropic
from typing import Callable
from config import settings
from services.conversation_manager import (
    ConversationState, add_clarification, set_plan, add_history_log, get_state
)

_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "clarifier_system.md"
CLARIFIER_SYSTEM = _PROMPT_PATH.read_text(encoding="utf-8")


def _extract_json(text: str) -> dict:
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return {
        "action": "ask",
        "chat_message": "请描述你的需求",
        "questions": [{"id": "fallback", "question": "请描述你想构建的工作流", "hint": "越详细越好"}],
    }


async def clarify(
    session_id: str,
    user_message: str,
    state: ConversationState,
    sio_emit_fn: Callable,
) -> None:
    messages = state.history + [{"role": "user", "content": user_message}]
    msg_id = f"msg_{uuid.uuid4().hex[:8]}"

    await sio_emit_fn("chat:stream_start", {"message_id": msg_id, "sender": "orchestrai"}, room=session_id)

    full_text = ""
    try:
        async with _client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=CLARIFIER_SYSTEM,
            messages=messages,
        ) as stream:
            async for token in stream.text_stream:
                full_text += token
                await sio_emit_fn("chat:stream_token", {"message_id": msg_id, "token": token}, room=session_id)
    except Exception:
        full_text = '{"action":"ask","chat_message":"抱歉，发生了错误，请重试。","questions":[{"id":"fallback","question":"请描述你的需求","hint":"越详细越好"}]}'

    await sio_emit_fn("chat:stream_end", {"message_id": msg_id, "content": full_text}, room=session_id)

    parsed = _extract_json(full_text)
    action = parsed.get("action", "ask")

    if action == "ask":
        questions = parsed.get("questions", [])
        for q in questions:
            add_clarification(session_id, q.get("id", uuid.uuid4().hex[:6]), q.get("question", ""))
        await sio_emit_fn("clarification:update", {"questions": questions}, room=session_id)
        add_history_log(session_id, "澄清问题", f"提出 {len(questions)} 个问题")
    else:
        plan = parsed.get("plan", {})
        nodes_preview = plan.get("nodes", [])
        set_plan(session_id, plan.get("summary", ""), nodes_preview)
        await sio_emit_fn("clarification:plan_ready", {"plan": plan}, room=session_id)
        add_history_log(session_id, "计划呈现", plan.get("title", ""))

    updated_state = get_state(session_id)
    await sio_emit_fn(
        "history:update",
        {"entries": updated_state.history_log},
        room=session_id,
    )
