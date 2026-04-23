"""Collection endpoints for workflows (plural).

Individual workflow operations live in `routers/workflow.py` under the `/workflow`
prefix (GET/{id}, PATCH/{id}/node/{node_id}). This router handles the list view
at `GET /api/workflows` — deliberately split to avoid mixing collection vs. item
routes under one prefix.

The list endpoint returns a lightweight `WorkflowSummary` (no full node payload)
so the /workflows list page can page through many workflows cheaply. Use
`GET /api/workflow/{id}` to hydrate a single workflow with its nodes.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from services.workflow_db import load_all_workflows

router = APIRouter(prefix="/workflows", tags=["workflows"])


class WorkflowSummary(BaseModel):
    workflow_id: str
    title: str
    title_zh: str
    description: str
    node_count: int
    created_at: str


@router.get("", response_model=list[WorkflowSummary])
async def list_workflows() -> list[WorkflowSummary]:
    """List all workflows as lightweight summaries, newest first."""
    workflows = await load_all_workflows()
    summaries = [
        WorkflowSummary(
            workflow_id=w.workflow_id,
            title=w.title,
            title_zh=w.title_zh,
            description=w.description,
            node_count=len(w.nodes),
            created_at=w.created_at,
        )
        for w in workflows
    ]
    # Newest first — `created_at` is an ISO-8601 string, so lexicographic
    # sort works as a chronological sort for any consistent timezone suffix.
    summaries.sort(key=lambda s: s.created_at, reverse=True)
    return summaries
