"""Tests for the GET /api/workflows collection endpoint (routers/workflows.py).

We exercise the endpoint handler directly (FastAPI awaits async handlers the
same way pytest-asyncio does) against an in-memory SQLite engine, following
the same monkeypatch-`async_session` pattern as test_workflow_db.py.

Covered:
- empty DB returns []
- multiple workflows return lightweight summaries (no node payload), newest
  first
- node_count reflects `len(workflow.nodes)` rather than any DB column
"""

import os
import sys
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import Base
from models.db import WorkflowRecord  # noqa: F401 — registers the table
from models.workflow import NodeStatus, ToolType, Workflow, WorkflowNode
import services.workflow_db as wdb
from routers.workflows import list_workflows


def _make_workflow(wf_id: str, title: str, node_count: int, created_at: datetime) -> Workflow:
    nodes = [
        WorkflowNode(
            node_id=f"{wf_id}-n{i}",
            order=i,
            title=f"Node {i}",
            title_zh=f"节点 {i}",
            description="",
            description_zh="",
            assigned_ai="claude",
            assigned_tool="Python",
            tool_type=ToolType.code,
            status=NodeStatus.idle,
        )
        for i in range(1, node_count + 1)
    ]
    return Workflow(
        workflow_id=wf_id,
        title=title,
        title_zh=title,
        description="",
        nodes=nodes,
        created_at=created_at.isoformat(),
    )


async def _setup_in_memory_db(tmp_path, monkeypatch):
    url = f"sqlite+aiosqlite:///{tmp_path / 'list.db'}"
    engine = create_async_engine(url, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    monkeypatch.setattr(wdb, "async_session", session_factory)
    return engine


@pytest.mark.asyncio
async def test_list_workflows_empty(tmp_path, monkeypatch):
    engine = await _setup_in_memory_db(tmp_path, monkeypatch)
    try:
        result = await list_workflows()
        assert result == []
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_list_workflows_returns_summaries_newest_first(tmp_path, monkeypatch):
    engine = await _setup_in_memory_db(tmp_path, monkeypatch)
    try:
        now = datetime.now(timezone.utc)
        older = _make_workflow("wf_A", "Older Workflow", node_count=2, created_at=now - timedelta(days=1))
        newer = _make_workflow("wf_B", "Newer Workflow", node_count=5, created_at=now)

        await wdb.save_workflow(older, session_id="s1")
        await wdb.save_workflow(newer, session_id="s1")

        result = await list_workflows()

        assert len(result) == 2
        # Newest first
        assert result[0].workflow_id == "wf_B"
        assert result[1].workflow_id == "wf_A"

        # Summary shape — titles and node counts come through
        assert result[0].title == "Newer Workflow"
        assert result[0].node_count == 5
        assert result[1].node_count == 2

        # No accidental leak of full node payload
        assert not hasattr(result[0], "nodes")
    finally:
        await engine.dispose()
