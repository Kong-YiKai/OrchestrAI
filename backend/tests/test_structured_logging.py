import json
import os
import sys
from datetime import datetime, timezone

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.observability.logger import build_log_event, log_event  # noqa: E402


def test_build_log_event_includes_required_fields() -> None:
    event = build_log_event(
        event_type="workflow_json_parse_failed",
        session_id="session-1",
        workflow_id="wf_1",
        node_id="node_1",
        agent="workflow_designer",
        payload={"stop_reason": "max_tokens", "fallback_used": True},
    )

    assert event["event_type"] == "workflow_json_parse_failed"
    assert event["session_id"] == "session-1"
    assert event["workflow_id"] == "wf_1"
    assert event["node_id"] == "node_1"
    assert event["agent"] == "workflow_designer"
    assert event["payload"] == {"stop_reason": "max_tokens", "fallback_used": True}

    parsed_ts = datetime.fromisoformat(event["ts"])
    assert parsed_ts.tzinfo is not None


def test_log_event_writes_single_json_object(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level("INFO", logger="orchestrai"):
        log_event(
            event_type="socket_connected",
            session_id="default",
            agent="socket",
            payload={"sid": "abc"},
        )

    assert len(caplog.records) == 1
    payload = json.loads(caplog.records[0].message)
    assert payload["event_type"] == "socket_connected"
    assert payload["session_id"] == "default"
    assert payload["agent"] == "socket"
    assert payload["payload"] == {"sid": "abc"}


def test_log_event_serializes_non_json_payload_values(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level("INFO", logger="orchestrai"):
        log_event(
            event_type="payload_contains_datetime",
            payload={"when": datetime(2026, 5, 25, tzinfo=timezone.utc)},
        )

    payload = json.loads(caplog.records[0].message)
    assert payload["payload"]["when"] == "2026-05-25 00:00:00+00:00"
