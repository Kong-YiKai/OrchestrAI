from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

from models.workflow import Workflow
from services.executor import NodeExecutor
from services.workflow_db import load_workflow, load_all_workflows, update_workflow_nodes
from socket_manager import sio

router = APIRouter(prefix="/execution", tags=["execution"])


class RunRequest(BaseModel):
    session_id: str = "default"


@router.post("/run/{workflow_id}")
async def run_workflow(
    workflow_id: str, req: RunRequest, background_tasks: BackgroundTasks
):
    wf = await load_workflow(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    executor = NodeExecutor(session_id=req.session_id)
    background_tasks.add_task(_run_and_notify, executor, wf, req.session_id)
    return {"status": "started", "workflow_id": workflow_id}


async def _run_and_notify(executor: NodeExecutor, wf: Workflow, session_id: str):
    await executor.execute_workflow(wf)
    await update_workflow_nodes(wf)
    await sio.emit(
        "execution:workflow_complete",
        {"workflow_id": wf.workflow_id},
        room=session_id,
    )


@router.post("/node/{node_id}/retry")
async def retry_node(node_id: str, req: RunRequest, background_tasks: BackgroundTasks):
    # Find the node across all workflows
    all_workflows = await load_all_workflows()
    for wf in all_workflows:
        for node in wf.nodes:
            if node.node_id == node_id:
                node.status = "idle"  # type: ignore
                node.result = None
                node.error = None
                await update_workflow_nodes(wf)
                executor = NodeExecutor(session_id=req.session_id)
                background_tasks.add_task(executor.execute_node, node, wf.workflow_id)
                return {"status": "retrying", "node_id": node_id}
    raise HTTPException(status_code=404, detail="Node not found")
