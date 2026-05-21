from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from models.workflow import NodeType, ToolType
from services.workflow_db import load_workflow
from services.workflow_refinement import subdivide_node as subdivide_workflow_node

router = APIRouter(prefix="/workflow", tags=["workflow"])


class SubdivideNodeRequest(BaseModel):
    child_count: int = 4


@router.get("/{workflow_id}")
async def get_workflow(workflow_id: str):
    wf = await load_workflow(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return wf.model_dump()


EDITABLE_NODE_FIELDS = {
    "title",
    "title_zh",
    "description",
    "description_zh",
    "assigned_ai",
    "assigned_tool",
    "input_schema",
    "output_schema",
    "parent_node_id",
    "depends_on",
    "parallel_group",
}


@router.patch("/{workflow_id}/node/{node_id}")
async def update_node(workflow_id: str, node_id: str, body: dict):
    from services.workflow_db import update_workflow_nodes

    wf = await load_workflow(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    for node in wf.nodes:
        if node.node_id == node_id:
            for field in EDITABLE_NODE_FIELDS:
                if field in body:
                    setattr(node, field, body[field])
            if "tool_type" in body:
                try:
                    node.tool_type = ToolType(body["tool_type"])
                except ValueError as exc:
                    raise HTTPException(status_code=422, detail="Invalid tool_type") from exc
            if "node_type" in body:
                try:
                    node.node_type = NodeType(body["node_type"])
                except ValueError as exc:
                    raise HTTPException(status_code=422, detail="Invalid node_type") from exc
            await update_workflow_nodes(wf)
            return {"status": "ok"}
    raise HTTPException(status_code=404, detail="Node not found")


update_node_model = update_node


@router.post("/{workflow_id}/node/{node_id}/subdivide")
async def subdivide_node(
    workflow_id: str,
    node_id: str,
    body: SubdivideNodeRequest | None = None,
):
    from services.workflow_db import update_workflow_nodes

    wf = await load_workflow(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    child_count = body.child_count if body else 4
    children = subdivide_workflow_node(wf, node_id, child_count)
    if not children:
        raise HTTPException(status_code=404, detail="Node not found")
    await update_workflow_nodes(wf)
    return {
        "status": "ok",
        "workflow_id": workflow_id,
        "parent_node_id": node_id,
        "nodes": [node.model_dump(mode="json") for node in children],
    }
