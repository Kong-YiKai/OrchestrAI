from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from models.workflow import Workflow, WorkflowNode
from services.orchestrator import generate_workflow_and_respond
from services.workflow_db import save_workflow, load_workflow

router = APIRouter(prefix="/workflow", tags=["workflow"])


class GenerateWorkflowRequest(BaseModel):
    user_message: str
    session_id: str = "default"


@router.post("/generate")
async def generate_workflow(req: GenerateWorkflowRequest):
    workflow = await generate_workflow_and_respond(req.user_message, req.session_id)
    if workflow:
        await save_workflow(workflow, req.session_id)
        return {"workflow_id": workflow.workflow_id}
    return {"workflow_id": None, "error": "Generation failed"}


@router.get("/{workflow_id}")
async def get_workflow(workflow_id: str):
    wf = await load_workflow(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return wf.model_dump()


@router.patch("/{workflow_id}/node/{node_id}")
async def update_node_model(workflow_id: str, node_id: str, body: dict):
    from services.workflow_db import update_workflow_nodes

    wf = await load_workflow(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    for node in wf.nodes:
        if node.node_id == node_id:
            if "assigned_ai" in body:
                node.assigned_ai = body["assigned_ai"]
            await update_workflow_nodes(wf)
            return {"status": "ok"}
    raise HTTPException(status_code=404, detail="Node not found")
