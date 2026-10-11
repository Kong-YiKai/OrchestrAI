from __future__ import annotations
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal


@dataclass
class ConversationState:
    state: Literal["idle", "clarifying", "awaiting_confirm", "generating", "complete", "cancelled"] = "idle"
    history: list[dict] = field(default_factory=list)
    clarifications: list[dict] = field(default_factory=list)
    plan_summary: str | None = None
    plan_nodes_preview: list = field(default_factory=list)
    original_request: str = ""
    history_log: list[dict] = field(default_factory=list)
    compacted_context: dict | None = None


conversation_states: dict[str, ConversationState] = {}


def get_state(session_id: str) -> ConversationState:
    if session_id not in conversation_states:
        conversation_states[session_id] = ConversationState()
    return conversation_states[session_id]


def reset_state(session_id: str) -> None:
    conversation_states[session_id] = ConversationState()


def append_history(session_id: str, role: str, content: str) -> None:
    get_state(session_id).history.append({"role": role, "content": content})


def add_clarification(
    session_id: str,
    clar_id: str,
    question: str,
    options: list | None = None,
    hint: str = "",
) -> None:
    get_state(session_id).clarifications.append({
        "id": clar_id,
        "question": question,
        "hint": hint,
        "answer": "",
        "options": options or [],
        "status": "pending",
    })


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


def state_to_dict(state: ConversationState) -> dict:
    return {
        "state": state.state,
        "history": state.history,
        "clarifications": state.clarifications,
        "plan_summary": state.plan_summary,
        "plan_nodes_preview": state.plan_nodes_preview,
        "original_request": state.original_request,
        "history_log": state.history_log,
        "compacted_context": state.compacted_context,
    }


def state_from_dict(data: dict) -> ConversationState:
    return ConversationState(
        state=data.get("state", "idle"),
        history=data.get("history", []),
        clarifications=data.get("clarifications", []),
        plan_summary=data.get("plan_summary"),
        plan_nodes_preview=data.get("plan_nodes_preview", []),
        original_request=data.get("original_request", ""),
        history_log=data.get("history_log", []),
        compacted_context=data.get("compacted_context"),
    )


def restore_state(session_id: str, state: ConversationState) -> ConversationState:
    conversation_states[session_id] = state
    return state


def compact_state(
    state: ConversationState,
    *,
    keep_history: int = 8,
    keep_history_log: int = 12,
) -> dict:
    recent_history = state.history[-keep_history:] if keep_history > 0 else []
    recent_history_log = state.history_log[-keep_history_log:] if keep_history_log > 0 else []
    compacted = {
        "state": state.state,
        "original_request": state.original_request,
        "plan_summary": state.plan_summary,
        "plan_nodes_preview": state.plan_nodes_preview,
        "clarifications": state.clarifications,
        "recent_history": recent_history,
        "recent_history_log": recent_history_log,
        "dropped": {
            "history": max(len(state.history) - len(recent_history), 0),
            "history_log": max(len(state.history_log) - len(recent_history_log), 0),
        },
    }
    state.compacted_context = compacted
    return compacted
