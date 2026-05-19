import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.orchestrator_agent import _looks_like_development_request, _parse_route_response


def test_parse_valid_development_request():
    raw = '{"route": "development_request", "brief_reason": "user wants to build"}'
    assert _parse_route_response(raw)["route"] == "development_request"


def test_parse_valid_casual_chat():
    raw = '{"route": "casual_chat", "brief_reason": "greeting"}'
    assert _parse_route_response(raw)["route"] == "casual_chat"


def test_parse_with_surrounding_text():
    raw = 'Sure! {"route": "development_request", "brief_reason": "build task"} done.'
    assert _parse_route_response(raw)["route"] == "development_request"


def test_parse_invalid_json_fallback():
    result = _parse_route_response("not json at all")
    assert result["route"] == "casual_chat"
    assert "fallback" in result["brief_reason"]


def test_parse_empty_string_fallback():
    result = _parse_route_response("")
    assert result["route"] == "casual_chat"


def test_chinese_build_workflow_hint_routes_to_development():
    assert _looks_like_development_request(
        "帮我创建一个12306买票系统的模拟产品开发工作流，要包含需求、架构、前端、后端、测试和发布。"
    ) is True


def test_plain_greeting_is_not_development_hint():
    assert _looks_like_development_request("你好，你能做什么？") is False
