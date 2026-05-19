"""Tests for the mock-mode NodeExecutor path (services/executor.py).

When `mock=True`, the executor should:
1. Emit `execution:node_started` for every node (in order).
2. Emit some `execution:node_log` lines per node (we don't assert the exact
   text — just that the channel is exercised).
3. Emit `execution:node_complete` for every node with a NodeResult payload
   and an execution_method string.
4. Never call out to the real `_api_execute` / `_playwright_execute` /
   `_simulate_with_claude` branches.

The approach is to monkeypatch `socket_manager.sio.emit` with an async spy
and zero out the mock delays so the test runs fast.
"""

import os
import sys
from typing import Any

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import services.executor as executor_mod  # noqa: E402
from models.workflow import (  # noqa: E402
    NodeStatus,
    ToolType,
    Workflow,
    WorkflowNode,
)
from services.executor import NodeExecutor  # noqa: E402


def _make_workflow() -> Workflow:
    return Workflow(
        workflow_id="wf_mock",
        title="Mock WF",
        title_zh="模拟工作流",
        description="",
        nodes=[
            WorkflowNode(
                node_id="n1",
                order=1,
                title="Fetch data",
                title_zh="拉取数据",
                description="Call the API",
                description_zh="调用接口",
                assigned_ai="claude",
                assigned_tool="weather.gov",
                tool_type=ToolType.api,
                status=NodeStatus.idle,
            ),
            WorkflowNode(
                node_id="n2",
                order=2,
                title="Summarize",
                title_zh="汇总",
                description="Summarize the payload",
                description_zh="汇总结果",
                assigned_ai="claude",
                assigned_tool="Claude",
                tool_type=ToolType.llm,
                status=NodeStatus.idle,
            ),
        ],
    )


class _SpySio:
    """Stand-in for socket_manager.sio that records emit() calls."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any], str | None]] = []

    async def emit(self, event: str, payload: dict[str, Any], room: str | None = None) -> None:
        self.calls.append((event, payload, room))


@pytest.fixture(autouse=True)
def _fast_mock(monkeypatch: pytest.MonkeyPatch) -> None:
    # Zero out the artificial delays so the test is instant.
    monkeypatch.setattr(executor_mod, "MOCK_LOG_DELAY", 0)
    monkeypatch.setattr(executor_mod, "MOCK_BETWEEN_NODES", 0)


@pytest.mark.asyncio
async def test_mock_executor_emits_expected_sequence(monkeypatch: pytest.MonkeyPatch) -> None:
    spy = _SpySio()
    monkeypatch.setattr(executor_mod, "sio", spy)

    wf = _make_workflow()
    executor = NodeExecutor(session_id="s-test", mock=True)

    # Guard: real strategies must never be invoked in mock mode.
    async def _explode(*_args: Any, **_kwargs: Any) -> None:
        raise AssertionError("Real execution path should not be called in mock mode.")

    monkeypatch.setattr(executor, "_api_execute", _explode)
    monkeypatch.setattr(executor, "_playwright_execute", _explode)
    monkeypatch.setattr(executor, "_simulate_with_claude", _explode)

    await executor.execute_workflow(wf)

    events = [c[0] for c in spy.calls]

    # Both nodes went through start → log → complete.
    assert events.count("execution:node_started") == 2
    assert events.count("execution:node_complete") == 2
    assert events.count("execution:node_log") >= 2  # at least one log per node

    # Room is always the session id we passed.
    assert all(call[2] == "s-test" for call in spy.calls)

    # Order: node_started(n1) precedes node_complete(n1), which precedes
    # node_started(n2).
    def _index_of(event: str, node_id: str) -> int:
        for i, (ev, payload, _) in enumerate(spy.calls):
            if ev == event and payload.get("node_id") == node_id:
                return i
        raise AssertionError(f"{event} for {node_id} never emitted")

    assert _index_of("execution:node_started", "n1") < _index_of("execution:node_complete", "n1")
    assert _index_of("execution:node_complete", "n1") < _index_of("execution:node_started", "n2")
    assert _index_of("execution:node_started", "n2") < _index_of("execution:node_complete", "n2")

    # Completion payloads carry a result + method the frontend can render.
    completes = [c for c in spy.calls if c[0] == "execution:node_complete"]
    for _, payload, _ in completes:
        assert "result" in payload
        assert payload["result"]["raw"]["mock"] is True
        assert payload["execution_method"] in {"api", "playwright", "simulated"}

    # tool_type=api → execution_method=api; tool_type=llm → simulated.
    method_by_node = {
        c[1]["node_id"]: c[1]["execution_method"] for c in completes
    }
    assert method_by_node["n1"] == "api"
    assert method_by_node["n2"] == "simulated"

    # In-memory node state mirrors what a real run would persist.
    assert wf.nodes[0].status == NodeStatus.complete
    assert wf.nodes[0].result is not None
    assert wf.nodes[1].status == NodeStatus.complete


@pytest.mark.asyncio
async def test_mock_executor_single_node_tool_type_branches(monkeypatch: pytest.MonkeyPatch) -> None:
    """tool_type=web_automation should report method=playwright."""
    spy = _SpySio()
    monkeypatch.setattr(executor_mod, "sio", spy)

    node = WorkflowNode(
        node_id="nx",
        order=1,
        title="Scrape",
        title_zh="抓取",
        description="",
        description_zh="",
        assigned_ai="claude",
        assigned_tool="Google Scholar",
        tool_type=ToolType.web_automation,
        status=NodeStatus.idle,
    )

    executor = NodeExecutor(session_id="s-ui", mock=True)
    await executor.execute_node(node, workflow_id="wf_x")

    complete = next(c for c in spy.calls if c[0] == "execution:node_complete")
    assert complete[1]["execution_method"] == "playwright"
    assert node.status == NodeStatus.complete
