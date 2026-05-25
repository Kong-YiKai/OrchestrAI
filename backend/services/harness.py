import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

from database import async_session
from models.db import AgentSessionRecord, ApprovalRecord, ExecutionTraceRecord
from services.conversation_manager import (
    ConversationState,
    state_from_dict,
    state_to_dict,
)
from services.observability.logger import _json_safe, log_event


async def record_execution_trace(
    *,
    event_type: str,
    session_id: str | None = None,
    workflow_id: str | None = None,
    node_id: str | None = None,
    agent: str | None = None,
    payload: dict[str, Any] | None = None,
) -> str:
    trace_id = f"tr_{uuid.uuid4().hex[:12]}"
    safe_payload = _json_safe(payload or {})
    try:
        async with async_session() as session:
            session.add(
                ExecutionTraceRecord(
                    trace_id=trace_id,
                    session_id=session_id,
                    workflow_id=workflow_id,
                    node_id=node_id,
                    agent=agent or "",
                    event_type=event_type,
                    payload=safe_payload,
                )
            )
            await session.commit()
    except Exception as exc:
        log_event(
            event_type="execution_trace_persist_failed",
            session_id=session_id,
            workflow_id=workflow_id,
            node_id=node_id,
            agent="harness",
            payload={"trace_id": trace_id, "error_type": type(exc).__name__, "error": str(exc)},
        )
    log_event(
        event_type=event_type,
        session_id=session_id,
        workflow_id=workflow_id,
        node_id=node_id,
        agent=agent,
        payload={**safe_payload, "trace_id": trace_id},
    )
    return trace_id


async def save_session_checkpoint(
    session_id: str,
    state: ConversationState,
    *,
    resumable: bool = True,
) -> None:
    state_json = state_to_dict(state)
    async with async_session() as session:
        record = AgentSessionRecord(
            session_id=session_id,
            state=state.state,
            state_json=state_json,
            task_list_json=state.plan_nodes_preview,
            trajectory_json=state.history_log,
            resumable=resumable,
        )
        await session.merge(record)
        await session.commit()
    log_event(
        event_type="session_checkpoint_saved",
        session_id=session_id,
        agent="harness",
        payload={"state": state.state, "resumable": resumable},
    )


async def load_session_checkpoint(session_id: str) -> ConversationState | None:
    async with async_session() as session:
        result = await session.execute(
            select(AgentSessionRecord).where(AgentSessionRecord.session_id == session_id)
        )
        record = result.scalar_one_or_none()
    if not record or not record.resumable:
        return None
    state = state_from_dict(record.state_json or {})
    log_event(
        event_type="session_checkpoint_loaded",
        session_id=session_id,
        agent="harness",
        payload={"state": state.state},
    )
    return state


def _approval_to_dict(record: ApprovalRecord) -> dict[str, Any]:
    return {
        "approval_id": record.approval_id,
        "session_id": record.session_id,
        "workflow_id": record.workflow_id,
        "node_id": record.node_id,
        "action_type": record.action_type,
        "risk_level": record.risk_level,
        "requested_payload": record.requested_payload or {},
        "status": record.status,
        "decision": record.decision,
        "note": record.note,
        "created_at": record.created_at.isoformat() if record.created_at else "",
        "decided_at": record.decided_at.isoformat() if record.decided_at else None,
    }


async def create_approval_request(
    *,
    session_id: str,
    action_type: str,
    risk_level: str,
    requested_payload: dict[str, Any],
    workflow_id: str | None = None,
    node_id: str | None = None,
) -> dict[str, Any]:
    approval_id = f"ap_{uuid.uuid4().hex[:12]}"
    safe_payload = _json_safe(requested_payload)
    record = ApprovalRecord(
        approval_id=approval_id,
        session_id=session_id,
        workflow_id=workflow_id,
        node_id=node_id,
        action_type=action_type,
        risk_level=risk_level,
        requested_payload=safe_payload,
        status="pending",
    )
    async with async_session() as session:
        session.add(record)
        await session.commit()
        await session.refresh(record)
        approval = _approval_to_dict(record)
    await record_execution_trace(
        event_type="approval_required",
        session_id=session_id,
        workflow_id=workflow_id,
        node_id=node_id,
        agent="approval_gate",
        payload=approval,
    )
    return approval


async def decide_approval(
    approval_id: str,
    *,
    decision: str,
    note: str = "",
) -> dict[str, Any] | None:
    status = "approved" if decision == "approve" else "denied"
    async with async_session() as session:
        result = await session.execute(
            select(ApprovalRecord).where(ApprovalRecord.approval_id == approval_id)
        )
        record = result.scalar_one_or_none()
        if not record:
            return None
        record.status = status
        record.decision = decision
        record.note = note
        record.decided_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(record)
        approval = _approval_to_dict(record)
    await record_execution_trace(
        event_type="approval_resolved",
        session_id=approval["session_id"],
        workflow_id=approval["workflow_id"],
        node_id=approval["node_id"],
        agent="approval_gate",
        payload=approval,
    )
    return approval
