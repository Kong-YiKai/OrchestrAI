from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

from models.workflow import Workflow
from services.executor import NodeExecutor
from services.workflow_db import load_workflow, load_all_workflows, update_workflow_nodes
from services.execution_control import execution_control
from services.conversation_manager import compact_state, get_state
from services.harness import create_approval_request, decide_approval as decide_approval_record
from services.harness import record_execution_trace, save_session_checkpoint
from socket_manager import sio

router = APIRouter(prefix="/execution", tags=["execution"])


class RunRequest(BaseModel):
    session_id: str = "default"
    # When true, the executor skips real API/Playwright/Claude calls and emits
    # a staged mock event sequence. Used by the canvas Run button so demos
    # don't depend on external keys.
    mock: bool = False


class StopRequest(BaseModel):
    session_id: str = "default"


class ApprovalDecisionRequest(BaseModel):
    decision: str
    note: str = ""


class ApprovalRequest(BaseModel):
    session_id: str = "default"
    workflow_id: str | None = None
    node_id: str | None = None
    action_type: str
    risk_level: str = "dangerous"
    requested_payload: dict = {}


class KillSessionRequest(BaseModel):
    session_id: str = "default"
    reason: str = "user_requested"


def _next_state_after_kill(state):
    if state.plan_summary or state.plan_nodes_preview:
        return "awaiting_confirm"
    if state.clarifications:
        return "clarifying"
    return "cancelled"


@router.post("/run/{workflow_id}")
async def run_workflow(
    workflow_id: str, req: RunRequest, background_tasks: BackgroundTasks
):
    wf = await load_workflow(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    execution_control.clear_session_kill(req.session_id)
    executor = NodeExecutor(session_id=req.session_id, mock=req.mock)
    background_tasks.add_task(_run_and_notify, executor, wf, req.session_id)
    return {"status": "started", "workflow_id": workflow_id, "mock": req.mock}


async def _run_and_notify(executor: NodeExecutor, wf: Workflow, session_id: str):
    await executor.execute_workflow(wf)
    await update_workflow_nodes(wf)
    await sio.emit(
        "execution:workflow_complete",
        {"workflow_id": wf.workflow_id},
        room=session_id,
    )


async def _run_node_and_persist(executor: NodeExecutor, wf: Workflow, node_id: str):
    for node in wf.nodes:
        if node.node_id == node_id:
            await executor.execute_node(node, wf.workflow_id)
            await update_workflow_nodes(wf)
            return
    raise HTTPException(status_code=404, detail="Node not found")


@router.post("/node/{node_id}/run")
async def run_node(node_id: str, req: RunRequest, background_tasks: BackgroundTasks):
    all_workflows = await load_all_workflows()
    for wf in all_workflows:
        for node in wf.nodes:
            if node.node_id == node_id:
                execution_control.clear_session_kill(req.session_id)
                execution_control.clear_node_cancel(req.session_id, node_id)
                node.status = "idle"  # type: ignore
                node.result = None
                node.error = None
                await update_workflow_nodes(wf)
                executor = NodeExecutor(session_id=req.session_id, mock=req.mock)
                background_tasks.add_task(_run_node_and_persist, executor, wf, node_id)
    return {"status": "started", "node_id": node_id, "mock": req.mock}
    raise HTTPException(status_code=404, detail="Node not found")


@router.post("/node/{node_id}/stop")
async def stop_node(node_id: str, req: StopRequest):
    execution_control.request_node_cancel(req.session_id, node_id)
    await sio.emit(
        "execution:node_stopping",
        {"node_id": node_id},
        room=req.session_id,
    )
    return {"status": "stopping", "node_id": node_id}


@router.post("/node/{node_id}/retry")
async def retry_node(node_id: str, req: RunRequest, background_tasks: BackgroundTasks):
    # Find the node across all workflows
    all_workflows = await load_all_workflows()
    for wf in all_workflows:
        for node in wf.nodes:
            if node.node_id == node_id:
                execution_control.clear_session_kill(req.session_id)
                execution_control.clear_node_cancel(req.session_id, node_id)
                node.status = "idle"  # type: ignore
                node.result = None
                node.error = None
                await update_workflow_nodes(wf)
                executor = NodeExecutor(session_id=req.session_id, mock=req.mock)
                background_tasks.add_task(_run_node_and_persist, executor, wf, node_id)
                return {"status": "retrying", "node_id": node_id, "mock": req.mock}
    raise HTTPException(status_code=404, detail="Node not found")


@router.post("/approval/request")
async def request_approval(req: ApprovalRequest):
    approval = await create_approval_request(
        session_id=req.session_id,
        workflow_id=req.workflow_id,
        node_id=req.node_id,
        action_type=req.action_type,
        risk_level=req.risk_level,
        requested_payload=req.requested_payload,
    )
    await sio.emit("execution:approval_required", approval, room=req.session_id)
    return approval


@router.post("/approval/{approval_id}/decision")
async def decide_approval(approval_id: str, req: ApprovalDecisionRequest):
    if req.decision not in {"approve", "deny"}:
        raise HTTPException(status_code=422, detail="decision must be approve or deny")
    approval = await decide_approval_record(
        approval_id,
        decision=req.decision,
        note=req.note,
    )
    if not approval:
        raise HTTPException(status_code=404, detail="Approval not found")
    await sio.emit("execution:approval_resolved", approval, room=approval["session_id"])
    return approval


@router.post("/kill")
async def kill_session(req: KillSessionRequest):
    execution_control.request_session_kill(req.session_id)
    state = get_state(req.session_id)
    next_state = _next_state_after_kill(state)
    state.state = next_state  # type: ignore[assignment]
    compact_state(state)
    await save_session_checkpoint(req.session_id, state, resumable=True)
    await record_execution_trace(
        event_type="execution_session_killed",
        session_id=req.session_id,
        agent="execution_control",
        payload={"reason": req.reason, "next_state": next_state},
    )
    await sio.emit(
        "execution:killed",
        {"session_id": req.session_id, "reason": req.reason, "next_state": next_state},
        room=req.session_id,
    )
    return {"status": "killed", "session_id": req.session_id, "next_state": next_state}
