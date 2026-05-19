import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.clarifier_agent import (
    _build_deterministic_plan_response,
    _extract_json,
    _record_answers_from_user_message,
)
from services.conversation_manager import add_clarification, get_state, reset_state


def test_extract_ask_action():
    raw = '{"action": "ask", "chat_message": "hi", "questions": [{"id": "q1", "question": "What type?", "hint": "3D or 2D"}]}'
    result = _extract_json(raw)
    assert result["action"] == "ask"
    assert result["questions"][0]["id"] == "q1"


def test_extract_present_plan_action():
    raw = '{"action": "present_plan", "chat_message": "here is my plan", "plan": {"title": "3D Workflow", "summary": "s", "nodes": [], "confirmation_prompt": "ok?"}}'
    result = _extract_json(raw)
    assert result["action"] == "present_plan"
    assert result["plan"]["title"] == "3D Workflow"


def test_extract_with_surrounding_text():
    raw = 'Here is my response: {"action": "ask", "chat_message": "tell me more", "questions": []} and thats it'
    result = _extract_json(raw)
    assert result["action"] == "ask"


def test_extract_malformed_json_returns_fallback():
    result = _extract_json("this is not json")
    assert result["action"] == "ask"
    assert len(result["questions"]) == 1
    assert result["questions"][0]["id"] == "fallback"
    assert len(result["questions"][0]["options"]) >= 2


def test_extract_empty_returns_fallback():
    result = _extract_json("")
    assert result["action"] == "ask"


def test_extract_ask_adds_options_when_model_omits_them():
    raw = '{"action": "ask", "chat_message": "hi", "questions": [{"id": "q1", "question": "What scope?", "hint": "Pick one"}]}'
    result = _extract_json(raw)
    assert result["action"] == "ask"
    assert len(result["questions"][0]["options"]) >= 2


def test_extract_present_plan_with_surrounding_text_and_dependencies():
    raw = '好的，计划如下：{"action":"present_plan","chat_message":"请确认计划","plan":{"title":"T","summary":"S","nodes":[{"order":1,"title":"A","description":"D","recommended_ai":"claude","node_type":"phase","depends_on":[]}],"confirmation_prompt":"开始吗？"}}'
    result = _extract_json(raw)
    assert result["action"] == "present_plan"
    assert result["chat_message"] == "请确认计划"
    assert result["plan"]["nodes"][0]["node_type"] == "phase"


def test_record_answers_from_q_a_message_marks_pending_clarifications():
    reset_state("clarifier-test")
    add_clarification(
        "clarifier-test",
        "q1",
        "这个工作流的使用目的是什么？",
        options=[{"id": "learn", "label": "学习/教学演示"}],
    )
    state = get_state("clarifier-test")

    changed = _record_answers_from_user_message(
        "clarifier-test",
        "Q: 这个工作流的使用目的是什么？\nA: 学习/教学演示",
        state,
    )

    assert changed is True
    assert state.clarifications[0]["status"] == "answered"
    assert state.clarifications[0]["answer"] == "学习/教学演示"


def test_record_plain_answer_for_single_pending_fallback():
    reset_state("clarifier-fallback")
    add_clarification("clarifier-fallback", "fallback", "你希望这次先生成哪种范围的工作流？")
    state = get_state("clarifier-fallback")

    changed = _record_answers_from_user_message("clarifier-fallback", "分阶段完整方案", state)

    assert changed is True
    assert state.clarifications[0]["status"] == "answered"
    assert state.clarifications[0]["answer"] == "分阶段完整方案"


def test_deterministic_plan_response_uses_answered_clarifications():
    reset_state("clarifier-plan")
    state = get_state("clarifier-plan")
    state.original_request = "帮我创建一个12306买票系统的模拟产品开发工作流"
    state.clarifications = [
        {"id": "q1", "question": "目标范围？", "answer": "分阶段完整方案", "status": "answered"},
    ]

    result = _build_deterministic_plan_response(state)

    assert result["action"] == "present_plan"
    assert "12306" in result["plan"]["title"]
    assert len(result["plan"]["nodes"]) >= 6
    assert result["plan"]["nodes"][0]["node_type"] == "phase"
