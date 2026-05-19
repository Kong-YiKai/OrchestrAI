"""Node-level workflow operations for Phase 4.5 pre-work.

These tests pin the behavior needed by the canvas before the full Phase 4.5
task runtime exists:
- PATCH can edit node planning fields, not only the model.
- A single-node mock run persists its result back to the workflow row.
- Stop requests are recorded so the executor can cooperatively halt a node.
"""

import os
import sys
from datetime import datetime, timezone
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import Base
from models.db import WorkflowRecord  # noqa: F401
from models.workflow import NodeStatus, NodeType, ToolType, Workflow, WorkflowNode
import routers.execution as execution_router
import routers.workflow as workflow_router
import services.executor as executor_mod
import services.workflow_db as wdb


class _SpySio:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any], str | None]] = []

    async def emit(self, event: str, payload: dict[str, Any], room: str | None = None) -> None:
        self.calls.append((event, payload, room))


def _make_workflow() -> Workflow:
    return Workflow(
        workflow_id="wf_node_ops",
        title="Node Ops",
        title_zh="节点操作",
        description="",
        nodes=[
            WorkflowNode(
                node_id="node_a",
                order=1,
                title="Old title",
                title_zh="旧标题",
                description="Old description",
                description_zh="旧描述",
                assigned_ai="claude",
                assigned_tool="Claude",
                tool_type=ToolType.llm,
                input_schema={"old": "string"},
                output_schema={"old_result": "string"},
                status=NodeStatus.idle,
            )
        ],
        created_at=datetime.now(timezone.utc).isoformat(),
    )


def _make_parallel_workflow() -> Workflow:
    return Workflow(
        workflow_id="wf_parallel",
        title="Parallel WF",
        title_zh="并行工作流",
        description="",
        nodes=[
            WorkflowNode(
                node_id="phase_a",
                order=1,
                title="Architecture",
                title_zh="架构阶段",
                description="Define architecture",
                description_zh="定义架构",
                assigned_ai="claude",
                assigned_tool="Claude",
                tool_type=ToolType.llm,
                status=NodeStatus.idle,
            ),
            WorkflowNode(
                node_id="task_b",
                order=2,
                title="Frontend",
                title_zh="前端",
                description="Build UI",
                description_zh="构建 UI",
                assigned_ai="gpt",
                assigned_tool="React",
                tool_type=ToolType.code,
                status=NodeStatus.idle,
            ),
        ],
        created_at=datetime.now(timezone.utc).isoformat(),
    )


async def _setup_db(tmp_path, monkeypatch):
    url = f"sqlite+aiosqlite:///{tmp_path / 'node_ops.db'}"
    engine = create_async_engine(url, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    monkeypatch.setattr(wdb, "async_session", session_factory)
    return engine


@pytest.mark.asyncio
async def test_patch_node_updates_editable_planning_fields(tmp_path, monkeypatch):
    engine = await _setup_db(tmp_path, monkeypatch)
    try:
        await wdb.save_workflow(_make_workflow(), session_id="s-edit")

        response = await workflow_router.update_node(
            "wf_node_ops",
            "node_a",
            {
                "title": "New title",
                "title_zh": "新标题",
                "description": "New description",
                "description_zh": "新描述",
                "assigned_ai": "gpt",
                "assigned_tool": "Python",
                "tool_type": "code",
                "input_schema": {"city": "string"},
                "output_schema": {"forecast": "json"},
            },
        )

        assert response["status"] == "ok"
        loaded = await wdb.load_workflow("wf_node_ops")
        assert loaded is not None
        node = loaded.nodes[0]
        assert node.title == "New title"
        assert node.title_zh == "新标题"
        assert node.description == "New description"
        assert node.description_zh == "新描述"
        assert node.assigned_ai == "gpt"
        assert node.assigned_tool == "Python"
        assert node.tool_type == ToolType.code
        assert node.input_schema == {"city": "string"}
        assert node.output_schema == {"forecast": "json"}
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_workflow_node_dag_fields_roundtrip(tmp_path, monkeypatch):
    engine = await _setup_db(tmp_path, monkeypatch)
    try:
        wf = _make_parallel_workflow()
        wf.nodes[0].node_type = NodeType.phase
        wf.nodes[1].depends_on = ["phase_a"]
        wf.nodes[1].parent_node_id = "phase_a"
        wf.nodes[1].parallel_group = "build_tracks"

        await wdb.save_workflow(wf, session_id="s-dag")
        loaded = await wdb.load_workflow("wf_parallel")

        assert loaded is not None
        assert loaded.nodes[0].node_type == "phase"
        assert loaded.nodes[1].depends_on == ["phase_a"]
        assert loaded.nodes[1].parent_node_id == "phase_a"
        assert loaded.nodes[1].parallel_group == "build_tracks"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_patch_node_updates_dependency_fields(tmp_path, monkeypatch):
    engine = await _setup_db(tmp_path, monkeypatch)
    try:
        await wdb.save_workflow(_make_parallel_workflow(), session_id="s-dag-edit")

        response = await workflow_router.update_node(
            "wf_parallel",
            "task_b",
            {
                "node_type": "task",
                "parent_node_id": "phase_a",
                "depends_on": ["phase_a"],
                "parallel_group": "build_tracks",
            },
        )

        assert response["status"] == "ok"
        loaded = await wdb.load_workflow("wf_parallel")
        assert loaded is not None
        node = loaded.nodes[1]
        assert node.node_type == "task"
        assert node.parent_node_id == "phase_a"
        assert node.depends_on == ["phase_a"]
        assert node.parallel_group == "build_tracks"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_subdivide_node_adds_child_nodes_with_parallel_dependencies(tmp_path, monkeypatch):
    engine = await _setup_db(tmp_path, monkeypatch)
    try:
        await wdb.save_workflow(_make_workflow(), session_id="s-subdivide")

        response = await workflow_router.subdivide_node(
            "wf_node_ops",
            "node_a",
            workflow_router.SubdivideNodeRequest(child_count=4),
        )

        assert response["status"] == "ok"
        assert len(response["nodes"]) == 4
        loaded = await wdb.load_workflow("wf_node_ops")
        assert loaded is not None
        parent = next(n for n in loaded.nodes if n.node_id == "node_a")
        children = [n for n in loaded.nodes if n.parent_node_id == "node_a"]

        assert parent.node_type == "phase"
        assert len(children) == 4
        assert children[0].depends_on == ["node_a"]
        assert children[1].depends_on == [children[0].node_id]
        assert children[2].depends_on == [children[0].node_id]
        assert children[1].parallel_group == children[2].parallel_group
        assert children[3].depends_on == [children[1].node_id, children[2].node_id]
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_run_single_node_mock_persists_result(tmp_path, monkeypatch):
    engine = await _setup_db(tmp_path, monkeypatch)
    spy = _SpySio()
    monkeypatch.setattr(executor_mod, "sio", spy)
    monkeypatch.setattr(executor_mod, "MOCK_LOG_DELAY", 0)
    monkeypatch.setattr(executor_mod, "MOCK_BETWEEN_NODES", 0)
    try:
        await wdb.save_workflow(_make_workflow(), session_id="s-run")
        wf = await wdb.load_workflow("wf_node_ops")
        assert wf is not None

        executor = executor_mod.NodeExecutor(session_id="s-run", mock=True)
        await execution_router._run_node_and_persist(executor, wf, "node_a")

        loaded = await wdb.load_workflow("wf_node_ops")
        assert loaded is not None
        node = loaded.nodes[0]
        assert node.status == NodeStatus.complete
        assert node.result is not None
        assert node.result.raw["mock"] is True
        assert node.execution_method is not None
        assert any(call[0] == "execution:node_complete" for call in spy.calls)
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_stop_node_records_cancel_request_and_emits_event(monkeypatch):
    spy = _SpySio()
    monkeypatch.setattr(execution_router, "sio", spy)

    response = await execution_router.stop_node(
        "node_a",
        execution_router.StopRequest(session_id="s-stop"),
    )

    assert response == {"status": "stopping", "node_id": "node_a"}
    assert execution_router.execution_control.is_node_cancelled("s-stop", "node_a") is True
    assert spy.calls == [
        (
            "execution:node_stopping",
            {"node_id": "node_a"},
            "s-stop",
        )
    ]
    execution_router.execution_control.clear_node_cancel("s-stop", "node_a")
