"""Small in-process execution control registry.

Phase 4.5 will replace this with persisted task state and stronger cancellation.
For the Phase 4.5 pre-work, this gives node-level Stop a concrete contract and
lets mock/demo execution halt cooperatively between stages.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ExecutionControl:
    _cancelled_nodes: set[tuple[str, str]] = field(default_factory=set)

    def request_node_cancel(self, session_id: str, node_id: str) -> None:
        self._cancelled_nodes.add((session_id, node_id))

    def clear_node_cancel(self, session_id: str, node_id: str) -> None:
        self._cancelled_nodes.discard((session_id, node_id))

    def is_node_cancelled(self, session_id: str, node_id: str) -> bool:
        return (session_id, node_id) in self._cancelled_nodes


execution_control = ExecutionControl()
