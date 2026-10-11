import os
import sys
from datetime import datetime, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import Base
from models.db import AgentSessionRecord, ApprovalRecord, ExecutionTraceRecord  # noqa: F401
from routers.execution import ApprovalDecisionRequest, KillSessionRequest, decide_approval, kill_session
from routers.chat import resume_session
from services.conversation_manager import (
    ConversationState,
    compact_state,
    conversation_states,
    get_state,
)
import services.harness as harness


async def _setup_db(tmp_path, monkeypatch):
    url = f"sqlite+aiosqlite:///{tmp_path / 'harness.db'}"
    engine = create_async_engine(url, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    monkeypatch.setattr(harness, "async_session", session_factory)
    return engine, session_factory


@pytest.mark.asyncio
async def test_record_execution_trace_persists_structured_event(tmp_path, monkeypatch):
    engine, session_factory = await _setup_db(tmp_path, monkeypatch)
    try:
        trace_id = await harness.record_execution_trace(
            event_type="execution_node_started",
            session_id="s-trace",
            workflow_id="wf_1",
            node_id="node_1",
            agent="node_executor",
            payload={"mock": True, "tool_type": "llm"},
        )

        async with session_factory() as session:
            result = await session.execute(
                select(ExecutionTraceRecord).where(ExecutionTraceRecord.trace_id == trace_id)
            )
            record = result.scalar_one()

        assert record.session_id == "s-trace"
        assert record.workflow_id == "wf_1"
        assert record.node_id == "node_1"
        assert record.agent == "node_executor"
        assert record.event_type == "execution_node_started"
        assert record.payload == {"mock": True, "tool_type": "llm"}
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_session_checkpoint_roundtrip_restores_conversation_state(tmp_path, monkeypatch):
    engine, _ = await _setup_db(tmp_path, monkeypatch)
    try:
        state = ConversationState(
            state="awaiting_confirm",
            history=[{"role": "user", "content": "Build app"}],
            clarifications=[
                {
                    "id": "q1",
                    "question": "Scope?",
                    "answer": "MVP",
                    "options": [],
                    "status": "answered",
                }
            ],
            plan_summary="Build MVP",
            plan_nodes_preview=[{"order": 1, "title": "Plan"}],
            original_request="Build app",
            history_log=[
                {
                    "entry_id": "he_1",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "action": "计划呈现",
                    "detail": "Build MVP",
                }
            ],
        )

        await harness.save_session_checkpoint("s-checkpoint", state, resumable=True)
        conversation_states.clear()

        restored = await harness.load_session_checkpoint("s-checkpoint")

        assert restored is not None
        assert restored.state == "awaiting_confirm"
        assert restored.history[0]["content"] == "Build app"
        assert restored.clarifications[0]["answer"] == "MVP"
        assert restored.plan_nodes_preview[0]["title"] == "Plan"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_resume_session_endpoint_restores_memory_state(tmp_path, monkeypatch):
    engine, _ = await _setup_db(tmp_path, monkeypatch)
    try:
        state = ConversationState(state="clarifying", original_request="Build workflow")
        await harness.save_session_checkpoint("s-resume", state, resumable=True)
        conversation_states.clear()

        response = await resume_session("s-resume")

        assert response["status"] == "resumed"
        assert response["session_id"] == "s-resume"
        assert response["state"]["state"] == "clarifying"
        assert get_state("s-resume").original_request == "Build workflow"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_create_and_decide_approval_records_audit_state(tmp_path, monkeypatch):
    engine, session_factory = await _setup_db(tmp_path, monkeypatch)
    try:
        approval = await harness.create_approval_request(
            session_id="s-approval",
            node_id="node_1",
            action_type="delete_file",
            risk_level="dangerous",
            requested_payload={"path": "C:/tmp/demo.txt"},
        )

        assert approval["status"] == "pending"
        assert approval["risk_level"] == "dangerous"

        decided = await harness.decide_approval(
            approval["approval_id"],
            decision="approve",
            note="user confirmed",
        )

        assert decided is not None
        assert decided["status"] == "approved"
        assert decided["decision"] == "approve"
        assert decided["note"] == "user confirmed"

        async with session_factory() as session:
            result = await session.execute(
                select(ApprovalRecord).where(ApprovalRecord.approval_id == approval["approval_id"])
            )
            record = result.scalar_one()

        assert record.status == "approved"
        assert record.decision == "approve"
        assert record.requested_payload == {"path": "C:/tmp/demo.txt"}
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_decide_approval_endpoint_emits_socket_event(tmp_path, monkeypatch):
    engine, _ = await _setup_db(tmp_path, monkeypatch)
    calls = []

    class SpySio:
        async def emit(self, event, payload, room=None):
            calls.append((event, payload, room))

    monkeypatch.setattr("routers.execution.sio", SpySio())
    try:
        approval = await harness.create_approval_request(
            session_id="s-api",
            action_type="install_software",
            risk_level="dangerous",
            requested_payload={"name": "demo"},
        )

        response = await decide_approval(
            approval["approval_id"],
            ApprovalDecisionRequest(decision="deny", note="not now"),
        )

        assert response["status"] == "denied"
        assert calls[0][0] == "execution:approval_resolved"
        assert calls[0][1]["approval_id"] == approval["approval_id"]
        assert calls[0][2] == "s-api"
    finally:
        await engine.dispose()


def test_compact_state_preserves_goal_plan_and_recent_context():
    state = ConversationState(
        state="clarifying",
        original_request="Build a 12306 ticket demo",
        plan_summary="MVP workflow",
        plan_nodes_preview=[{"order": 1, "title": "Plan"}],
        history=[{"role": "user", "content": f"message {i}"} for i in range(10)],
        history_log=[
            {"entry_id": f"he_{i}", "timestamp": "t", "action": "action", "detail": str(i)}
            for i in range(12)
        ],
    )

    compacted = compact_state(state, keep_history=3, keep_history_log=4)

    assert compacted["original_request"] == "Build a 12306 ticket demo"
    assert compacted["plan_summary"] == "MVP workflow"
    assert compacted["plan_nodes_preview"] == [{"order": 1, "title": "Plan"}]
    assert [item["content"] for item in compacted["recent_history"]] == [
        "message 7",
        "message 8",
        "message 9",
    ]
    assert len(compacted["recent_history_log"]) == 4
    assert compacted["dropped"]["history"] == 7
    assert compacted["dropped"]["history_log"] == 8


@pytest.mark.asyncio
async def test_kill_session_endpoint_marks_session_cancelled_and_checkpoints(tmp_path, monkeypatch):
    engine, session_factory = await _setup_db(tmp_path, monkeypatch)
    calls = []

    class SpySio:
        async def emit(self, event, payload, room=None):
            calls.append((event, payload, room))

    monkeypatch.setattr("routers.execution.sio", SpySio())
    try:
        state = get_state("s-kill-api")
        state.state = "generating"
        state.original_request = "Build app"

        response = await kill_session(KillSessionRequest(session_id="s-kill-api"))

        assert response == {
            "status": "killed",
            "session_id": "s-kill-api",
            "next_state": "cancelled",
        }
        assert calls[0][0] == "execution:killed"
        assert calls[0][1]["next_state"] == "cancelled"
        assert calls[0][2] == "s-kill-api"

        async with session_factory() as session:
            result = await session.execute(
                select(AgentSessionRecord).where(AgentSessionRecord.session_id == "s-kill-api")
            )
            record = result.scalar_one()

        assert record.state == "cancelled"
        assert record.resumable is True
        assert record.state_json["compacted_context"]["original_request"] == "Build app"
    finally:
        conversation_states.pop("s-kill-api", None)
        await engine.dispose()


@pytest.mark.asyncio
async def test_kill_session_with_existing_plan_returns_to_awaiting_confirm(tmp_path, monkeypatch):
    engine, session_factory = await _setup_db(tmp_path, monkeypatch)
    calls = []

    class SpySio:
        async def emit(self, event, payload, room=None):
            calls.append((event, payload, room))

    monkeypatch.setattr("routers.execution.sio", SpySio())
    try:
        state = get_state("s-kill-plan")
        state.state = "generating"
        state.original_request = "Build ecommerce workflow"
        state.plan_summary = "阶段级电商工作流"
        state.plan_nodes_preview = [{"order": 1, "title": "需求分析"}]

        response = await kill_session(KillSessionRequest(session_id="s-kill-plan"))

        assert response == {
            "status": "killed",
            "session_id": "s-kill-plan",
            "next_state": "awaiting_confirm",
        }
        assert calls[0][0] == "execution:killed"
        assert calls[0][1]["next_state"] == "awaiting_confirm"

        async with session_factory() as session:
            result = await session.execute(
                select(AgentSessionRecord).where(AgentSessionRecord.session_id == "s-kill-plan")
            )
            record = result.scalar_one()

        assert record.state == "awaiting_confirm"
        assert record.state_json["compacted_context"]["state"] == "awaiting_confirm"
    finally:
        conversation_states.pop("s-kill-plan", None)
        await engine.dispose()
