import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.conversation_manager import (
    get_state, reset_state, append_history,
    add_clarification, answer_clarification,
    set_plan, add_history_log, conversation_states,
)


def setup_function():
    conversation_states.clear()


def test_get_state_creates_idle_default():
    state = get_state("s1")
    assert state.state == "idle"
    assert state.history == []


def test_get_state_returns_same_object():
    s1 = get_state("s2")
    s2 = get_state("s2")
    assert s1 is s2


def test_reset_state_clears_to_idle():
    state = get_state("s3")
    state.state = "clarifying"
    reset_state("s3")
    assert get_state("s3").state == "idle"


def test_append_history():
    append_history("s4", "user", "hello")
    append_history("s4", "assistant", "hi")
    h = get_state("s4").history
    assert len(h) == 2
    assert h[0] == {"role": "user", "content": "hello"}


def test_add_and_answer_clarification():
    add_clarification("s5", "q1", "What type?")
    state = get_state("s5")
    assert state.clarifications[0]["status"] == "pending"
    answer_clarification("s5", "q1", "3D modeling")
    assert state.clarifications[0]["status"] == "answered"
    assert state.clarifications[0]["answer"] == "3D modeling"


def test_set_plan_transitions_to_awaiting_confirm():
    state = get_state("s6")
    state.state = "clarifying"
    set_plan("s6", "Build a 3D tool", [{"order": 1, "title": "Init"}])
    assert state.state == "awaiting_confirm"
    assert state.plan_summary == "Build a 3D tool"
    assert len(state.plan_nodes_preview) == 1


def test_add_history_log():
    add_history_log("s7", "用户消息", "hello")
    log = get_state("s7").history_log
    assert len(log) == 1
    assert log[0]["action"] == "用户消息"
    assert "entry_id" in log[0]
    assert "timestamp" in log[0]
