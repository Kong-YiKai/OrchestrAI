from dataclasses import dataclass
from typing import Any

from services.harness import record_execution_trace


@dataclass(frozen=True)
class PerceptionTraceContext:
    session_id: str | None = None
    workflow_id: str | None = None
    node_id: str | None = None


async def trace_perception_event(
    *,
    event_type: str,
    payload: dict[str, Any],
    context: PerceptionTraceContext | None = None,
) -> str:
    context = context or PerceptionTraceContext()
    return await record_execution_trace(
        event_type=event_type,
        session_id=context.session_id,
        workflow_id=context.workflow_id,
        node_id=context.node_id,
        agent="web_perception",
        payload=payload,
    )

