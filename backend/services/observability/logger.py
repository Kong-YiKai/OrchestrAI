import json
import logging
from datetime import datetime, timezone
from typing import Any

LOGGER_NAME = "orchestrai"
logging.getLogger(LOGGER_NAME).setLevel(logging.INFO)


def _json_default(value: Any) -> str:
    return str(value)


def _json_safe(value: Any) -> Any:
    return json.loads(json.dumps(value, ensure_ascii=False, default=_json_default))


def build_log_event(
    *,
    event_type: str,
    session_id: str | None = None,
    workflow_id: str | None = None,
    node_id: str | None = None,
    agent: str | None = None,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "ts": datetime.now(timezone.utc).isoformat(),
        "session_id": session_id,
        "workflow_id": workflow_id,
        "node_id": node_id,
        "agent": agent,
        "event_type": event_type,
        "payload": _json_safe(payload or {}),
    }


def log_event(
    *,
    event_type: str,
    session_id: str | None = None,
    workflow_id: str | None = None,
    node_id: str | None = None,
    agent: str | None = None,
    payload: dict[str, Any] | None = None,
    level: int = logging.INFO,
) -> dict[str, Any]:
    event = build_log_event(
        event_type=event_type,
        session_id=session_id,
        workflow_id=workflow_id,
        node_id=node_id,
        agent=agent,
        payload=payload,
    )
    logging.getLogger(LOGGER_NAME).log(
        level,
        json.dumps(event, ensure_ascii=False, separators=(",", ":")),
    )
    return event
