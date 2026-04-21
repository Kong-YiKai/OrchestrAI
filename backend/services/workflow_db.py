"""
Thin DB helpers for Workflow CRUD — replaces the old in-memory workflow_store dict.
"""

from datetime import datetime, timezone

from models.workflow import Workflow, WorkflowNode
from models.db import WorkflowRecord
from database import async_session

from sqlalchemy import select


def _coerce_created_at(value: str | datetime | None) -> datetime:
    # WorkflowRecord.created_at is a DateTime column — asyncpg/SQLite reject
    # raw ISO strings. Workflow.created_at is produced as an ISO string by the
    # designer, so convert here before the ORM sees it.
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            pass
    return datetime.now(timezone.utc)


async def save_workflow(workflow: Workflow, session_id: str = "default") -> None:
    async with async_session() as session:
        record = WorkflowRecord(
            workflow_id=workflow.workflow_id,
            session_id=session_id,
            title=workflow.title,
            title_zh=workflow.title_zh,
            description=workflow.description,
            nodes=[n.model_dump(mode="json") for n in workflow.nodes],
            created_at=_coerce_created_at(workflow.created_at),
        )
        await session.merge(record)
        await session.commit()


async def load_workflow(workflow_id: str) -> Workflow | None:
    async with async_session() as session:
        result = await session.execute(
            select(WorkflowRecord).where(WorkflowRecord.workflow_id == workflow_id)
        )
        record = result.scalar_one_or_none()
        if not record:
            return None
        return _record_to_workflow(record)


async def load_all_workflows() -> list[Workflow]:
    async with async_session() as session:
        result = await session.execute(select(WorkflowRecord))
        return [_record_to_workflow(r) for r in result.scalars().all()]


async def update_workflow_nodes(workflow: Workflow) -> None:
    """Persist node status/result changes back to DB."""
    async with async_session() as session:
        result = await session.execute(
            select(WorkflowRecord).where(
                WorkflowRecord.workflow_id == workflow.workflow_id
            )
        )
        record = result.scalar_one_or_none()
        if record:
            record.nodes = [n.model_dump(mode="json") for n in workflow.nodes]
            await session.commit()


def _record_to_workflow(record: WorkflowRecord) -> Workflow:
    nodes = [WorkflowNode(**n) for n in (record.nodes or [])]
    return Workflow(
        workflow_id=record.workflow_id,
        title=record.title,
        title_zh=record.title_zh,
        description=record.description,
        nodes=nodes,
        created_at=str(record.created_at) if record.created_at else "",
    )
