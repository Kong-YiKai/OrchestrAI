import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.clarifier_agent import _extract_json


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


def test_extract_empty_returns_fallback():
    result = _extract_json("")
    assert result["action"] == "ask"
