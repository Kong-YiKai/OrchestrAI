from __future__ import annotations
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal


@dataclass
class ConversationState:
    state: Literal["idle", "clarifying", "awaiting_confirm", "generating", "complete"] = "idle"
    history: list[dict] = field(default_factory=list)
    clarifications: list[dict] = field(default_factory=list)
    plan_summary: str | None = None
    plan_nodes_preview: list = field(default_factory=list)
    original_request: str = ""
    history_log: list[dict] = field(default_factory=list)


conversation_states: dict[str, ConversationState] = {}


def get_state(session_id: str) -> ConversationState:
    if session_id not in conversation_states:
        conversation_states[session_id] = ConversationState()
    return conversation_states[session_id]


def reset_state(session_id: str) -> None:
    conversation_states[session_id] = ConversationState()


def append_history(session_id: str, role: str, content: str) -> None:
    get_state(session_id).history.append({"role": role, "content": content})


def add_clarification(session_id: str, clar_id: str, question: str) -> None:
    get_state(session_id).clarifications.append(
        {"id": clar_id, "question": question, "answer": "", "status": "pending"}
    )


def answer_clarification(session_id: str, clar_id: str, answer: str) -> None:
    for c in get_state(session_id).clarifications:
        if c["id"] == clar_id:
            c["answer"] = answer
            c["status"] = "answered"
            break


def set_plan(session_id: str, summary: str, nodes_preview: list) -> None:
    state = get_state(session_id)
    state.plan_summary = summary
    state.plan_nodes_preview = nodes_preview
    state.state = "awaiting_confirm"


def add_history_log(session_id: str, action: str, detail: str = "") -> None:
    get_state(session_id).history_log.append({
        "entry_id": f"he_{uuid.uuid4().hex[:8]}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "detail": detail,
    })
