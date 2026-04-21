"""Regression tests for workflow_db save/load.

Phase 3 bug: Workflow.created_at is an ISO string, but WorkflowRecord.created_at
is a DateTime column. asyncpg/SQLite rejected the raw string silently in the
Socket.io handler, so workflow:ready never fired and /workflows stayed empty.
These tests pin the fix: the coercion helper accepts strings, and a full round
trip through an in-memory SQLite engine returns nodes intact.
"""

import os
import sys
from datetime import datetime, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import Base
from models.db import WorkflowRecord  # noqa: F401 — registers the table
from models.workflow import NodeStatus, ToolType, Workflow, WorkflowNode
import services.workflow_db as wdb


def _make_workflow() -> Workflow:
    return Workflow(
        workflow_id="wf_regression_01",
        title="Regression Save",
        title_zh="回归保存",
        description="",
        nodes=[
            WorkflowNode(
                node_id="n1",
                order=1,
                title="Fetch Data",
                title_zh="获取数据",
                description="",
                description_zh="",
                assigned_ai="claude",
                assigned_tool="Python",
                tool_type=ToolType.code,
                status=NodeStatus.idle,
            ),
        ],
        created_at=datetime.now(timezone.utc).isoformat(),
    )


@pytest.mark.asyncio
async def test_save_and_load_workflow_roundtrip_with_iso_string_created_at(tmp_path, monkeypatch):
    url = f"sqlite+aiosqlite:///{tmp_path / 'reg.db'}"
    engine = create_async_engine(url, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    monkeypatch.setattr(wdb, "async_session", session_factory)

    wf = _make_workflow()
    await wdb.save_workflow(wf, session_id="regression")
    loaded = await wdb.load_workflow(wf.workflow_id)

    assert loaded is not None
    assert loaded.workflow_id == wf.workflow_id
    assert len(loaded.nodes) == 1
    assert loaded.nodes[0].node_id == "n1"
    assert loaded.nodes[0].status == NodeStatus.idle
    assert loaded.nodes[0].tool_type == ToolType.code

    await engine.dispose()


def test_coerce_created_at_accepts_string_datetime_and_falsy():
    s = "2026-04-19T07:16:01.766828+00:00"
    assert wdb._coerce_created_at(s) == datetime.fromisoformat(s)

    now = datetime.now(timezone.utc)
    assert wdb._coerce_created_at(now) is now

    assert isinstance(wdb._coerce_created_at(None), datetime)
    assert isinstance(wdb._coerce_created_at(""), datetime)
    assert isinstance(wdb._coerce_created_at("not-a-datetime"), datetime)
