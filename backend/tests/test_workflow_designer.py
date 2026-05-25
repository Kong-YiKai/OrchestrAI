import sys
import os
import json
import pytest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.workflow_designer import (
    _build_context,
    _build_fallback_workflow,
    _emit_log,
    _parse_workflow,
)
from services.conversation_manager import ConversationState

VALID_JSON = """<workflow_json>{
  "workflow_id": "wf_test123",
  "title": "Data Analysis",
  "title_zh": "数据分析",
  "description": "Analyze sales data",
  "nodes": [
    {
      "node_id": "node_001",
      "order": 1,
      "title": "Load Data",
      "title_zh": "加载数据",
      "description": "Load CSV",
      "description_zh": "加载CSV",
      "assigned_ai": "claude",
      "assigned_tool": "Python",
      "tool_type": "code",
      "input_schema": {},
      "output_schema": {}
    }
  ]
}</workflow_json>"""


def test_parse_workflow_returns_workflow_object():
    wf = _parse_workflow(VALID_JSON)
    assert wf is not None
    assert wf.workflow_id == "wf_test123"
    assert wf.title == "Data Analysis"
    assert len(wf.nodes) == 1


def test_parse_workflow_node_fields():
    wf = _parse_workflow(VALID_JSON)
    node = wf.nodes[0]
    assert node.node_id == "node_001"
    assert node.order == 1
    assert node.assigned_ai == "claude"
    assert node.tool_type.value == "code"


def test_parse_workflow_node_dag_fields():
    raw = """<workflow_json>{
      "workflow_id": "wf_dag",
      "title": "DAG",
      "title_zh": "DAG",
      "description": "d",
      "nodes": [
        {
          "node_id": "phase_1",
          "order": 1,
          "title": "Architecture",
          "title_zh": "架构",
          "description": "d",
          "description_zh": "d",
          "assigned_ai": "claude",
          "assigned_tool": "Claude",
          "tool_type": "llm",
          "node_type": "phase",
          "depends_on": [],
          "input_schema": {},
          "output_schema": {}
        },
        {
          "node_id": "task_1",
          "order": 2,
          "title": "Frontend",
          "title_zh": "前端",
          "description": "d",
          "description_zh": "d",
          "assigned_ai": "gpt",
          "assigned_tool": "React",
          "tool_type": "code",
          "node_type": "task",
          "parent_node_id": "phase_1",
          "depends_on": ["phase_1"],
          "parallel_group": "build",
          "input_schema": {},
          "output_schema": {}
        }
      ]
    }</workflow_json>"""
    wf = _parse_workflow(raw)
    assert wf is not None
    assert wf.nodes[0].node_type == "phase"
    assert wf.nodes[1].parent_node_id == "phase_1"
    assert wf.nodes[1].depends_on == ["phase_1"]
    assert wf.nodes[1].parallel_group == "build"


def test_parse_workflow_missing_tags_returns_none():
    assert _parse_workflow("no tags here") is None


def test_parse_workflow_invalid_json_returns_none():
    assert _parse_workflow("<workflow_json>not json</workflow_json>") is None


def test_parse_workflow_handles_markdown_fence_inside_tags():
    wrapped = "<workflow_json>\n```json\n" + VALID_JSON.split("<workflow_json>")[1].split("</workflow_json>")[0] + "\n```\n</workflow_json>"
    wf = _parse_workflow(wrapped)
    assert wf is not None
    assert wf.workflow_id == "wf_test123"


def test_parse_workflow_handles_trailing_commas():
    with_trailing = """<workflow_json>{
      "workflow_id": "wf_tc",
      "title": "T",
      "title_zh": "T",
      "description": "d",
      "nodes": [
        {
          "node_id": "n1",
          "order": 1,
          "title": "A",
          "title_zh": "A",
          "description": "d",
          "description_zh": "d",
          "assigned_ai": "claude",
          "assigned_tool": "Python",
          "tool_type": "code",
          "input_schema": {},
          "output_schema": {},
        },
      ],
    }</workflow_json>"""
    wf = _parse_workflow(with_trailing)
    assert wf is not None
    assert wf.workflow_id == "wf_tc"


def test_parse_workflow_no_tags_balanced_brace_fallback():
    no_tags = "Here is the workflow:\n\n" + VALID_JSON.split("<workflow_json>")[1].split("</workflow_json>")[0] + "\n\nExtra trailing text."
    wf = _parse_workflow(no_tags)
    assert wf is not None
    assert wf.workflow_id == "wf_test123"


def test_parse_workflow_truncated_json_returns_none():
    truncated = '<workflow_json>{"workflow_id": "wf_x", "nodes": [{"title": "A"'
    assert _parse_workflow(truncated) is None


def test_build_context_includes_original_request():
    state = ConversationState(original_request="Build a 3D tool")
    ctx = _build_context(state)
    assert "Build a 3D tool" in ctx


def test_build_context_includes_answered_clarifications():
    state = ConversationState(original_request="Build X")
    state.clarifications = [
        {"question": "What type?", "answer": "3D", "status": "answered"},
        {"question": "Platform?", "answer": "Web", "status": "answered"},
    ]
    ctx = _build_context(state)
    assert "What type?" in ctx
    assert "3D" in ctx


def test_build_context_excludes_pending_clarifications():
    state = ConversationState(original_request="Build X")
    state.clarifications = [
        {"question": "Unanswered?", "answer": "", "status": "pending"},
    ]
    ctx = _build_context(state)
    assert "Unanswered?" not in ctx


def test_build_context_includes_plan_summary():
    state = ConversationState(original_request="Build X", plan_summary="3 nodes: load, process, output")
    ctx = _build_context(state)
    assert "3 nodes" in ctx


def test_build_fallback_workflow_from_plan_preview():
    state = ConversationState(
        original_request="帮我创建一个12306买票系统的模拟产品开发工作流",
        plan_summary="阶段级开发方案",
    )
    state.plan_nodes_preview = [
        {
            "order": 1,
            "title": "需求分析",
            "description": "梳理范围",
            "recommended_ai": "claude",
            "node_type": "phase",
            "depends_on": [],
        },
        {
            "order": 2,
            "title": "前端开发",
            "description": "实现界面",
            "recommended_ai": "gpt",
            "node_type": "phase",
            "depends_on": [1],
        },
        {
            "order": 3,
            "title": "后端开发",
            "description": "实现 API",
            "recommended_ai": "gpt",
            "node_type": "phase",
            "depends_on": [1],
        },
        {
            "order": 4,
            "title": "测试发布",
            "description": "验收交付",
            "recommended_ai": "claude",
            "node_type": "phase",
            "depends_on": [2, 3],
        },
    ]

    wf = _build_fallback_workflow(state)

    assert wf.title_zh
    assert len(wf.nodes) == 4
    assert wf.nodes[0].node_type == "phase"
    assert wf.nodes[1].depends_on == [wf.nodes[0].node_id]
    assert wf.nodes[2].depends_on == [wf.nodes[0].node_id]
    assert wf.nodes[3].depends_on == [wf.nodes[1].node_id, wf.nodes[2].node_id]


def test_build_fallback_workflow_without_plan_preview_has_safe_default():
    state = ConversationState(original_request="Build a demo product")

    wf = _build_fallback_workflow(state)

    assert len(wf.nodes) >= 6
    assert wf.nodes[0].title_zh == "需求分析与产品定义"


@pytest.mark.asyncio
async def test_emit_log_also_writes_structured_log(caplog):
    calls = []

    async def emit(event, payload, room=None):
        calls.append((event, payload, room))

    with caplog.at_level("INFO", logger="orchestrai"):
        await _emit_log(emit, "session-1", "thinking", "正在分析需求...", "detail")

    assert calls[0][0] == "building:log"
    structured = json.loads(caplog.records[0].message)
    assert structured["event_type"] == "building_log"
    assert structured["session_id"] == "session-1"
    assert structured["agent"] == "workflow_designer"
    assert structured["payload"]["type"] == "thinking"
    assert structured["payload"]["message"] == "正在分析需求..."
