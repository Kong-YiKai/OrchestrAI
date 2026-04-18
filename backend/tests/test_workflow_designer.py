import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.workflow_designer import _parse_workflow, _build_context
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


def test_parse_workflow_missing_tags_returns_none():
    assert _parse_workflow("no tags here") is None


def test_parse_workflow_invalid_json_returns_none():
    assert _parse_workflow("<workflow_json>not json</workflow_json>") is None


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
