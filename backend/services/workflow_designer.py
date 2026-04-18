import asyncio
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable
import anthropic
from config import settings
from services.conversation_manager import ConversationState, add_history_log
from models.workflow import Workflow, WorkflowNode, NodeStatus, ToolType

_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "workflow_designer_system.md"
WORKFLOW_DESIGNER_SYSTEM = _PROMPT_PATH.read_text(encoding="utf-8")


def _build_context(state: ConversationState) -> str:
    parts = [f"Original request: {state.original_request}"]
    answered = [c for c in state.clarifications if c.get("status") == "answered"]
    if answered:
        parts.append("\nClarification Q&A:")
        for c in answered:
            parts.append(f"Q: {c['question']}\nA: {c['answer']}")
    if state.plan_summary:
        parts.append(f"\nApproved plan summary: {state.plan_summary}")
    return "\n".join(parts)


async def _emit_log(sio_emit_fn: Callable, session_id: str, log_type: str, message: str, detail: str = "") -> None:
    log = {
        "log_id": f"log_{uuid.uuid4().hex[:8]}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "type": log_type,
        "message": message,
        "detail": detail,
        "agent": "Workflow Designer",
    }
    await sio_emit_fn("building:log", log, room=session_id)


async def design_workflow(
    session_id: str,
    state: ConversationState,
    sio_emit_fn: Callable,
) -> Workflow | None:
    await sio_emit_fn("building:started", {"session_id": session_id}, room=session_id)
    await _emit_log(sio_emit_fn, session_id, "thinking", "正在分析需求...")
    await asyncio.sleep(0.3)

    context = _build_context(state)
    messages = [{"role": "user", "content": context}]

    full_text = ""
    last_log_time = asyncio.get_event_loop().time()
    log_messages = ["正在设计工作流结构...", "正在分配 AI 模型...", "正在定义节点输入输出..."]
    log_idx = 0

    try:
        await _emit_log(sio_emit_fn, session_id, "analyzing", "正在理解需求上下文...")
        async with _client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            system=WORKFLOW_DESIGNER_SYSTEM,
            messages=messages,
        ) as stream:
            async for token in stream.text_stream:
                full_text += token
                now = asyncio.get_event_loop().time()
                if now - last_log_time > 1.5 and log_idx < len(log_messages):
                    await _emit_log(sio_emit_fn, session_id, "generating", log_messages[log_idx])
                    log_idx += 1
                    last_log_time = now
    except Exception as e:
        await _emit_log(sio_emit_fn, session_id, "error", f"生成失败: {str(e)[:40]}")
        return None

    workflow = _parse_workflow(full_text)
    if not workflow:
        # Log the raw response tail to help diagnose future failures
        tail = full_text[-300:].replace('\n', ' ')
        print(f"[designer] parse failed. response tail: {tail}")
        await _emit_log(sio_emit_fn, session_id, "error", "解析工作流 JSON 失败")
        return None

    await _emit_log(sio_emit_fn, session_id, "done", f"工作流设计完成，共 {len(workflow.nodes)} 个节点")
    await sio_emit_fn("building:complete", {"node_count": len(workflow.nodes)}, room=session_id)

    add_history_log(session_id, "工作流生成", f"{workflow.title}（{len(workflow.nodes)} 个节点）")
    return workflow


def _parse_workflow(text: str) -> Workflow | None:
    # Try tagged format first
    match = re.search(r'<workflow_json>(.*?)</workflow_json>', text, re.DOTALL)
    if match:
        raw = match.group(1).strip()
    else:
        # Fallback: find the outermost JSON object in the response
        obj_match = re.search(r'\{[\s\S]*"nodes"[\s\S]*\}', text)
        if not obj_match:
            return None
        raw = obj_match.group(0)
    try:
        data = json.loads(raw)
        nodes = []
        for n in data.get("nodes", []):
            nodes.append(WorkflowNode(
                node_id=n.get("node_id", f"node_{uuid.uuid4().hex[:8]}"),
                order=n.get("order", 1),
                title=n.get("title", ""),
                title_zh=n.get("title_zh", ""),
                description=n.get("description", ""),
                description_zh=n.get("description_zh", ""),
                assigned_ai=n.get("assigned_ai", "claude"),
                assigned_tool=n.get("assigned_tool", "Claude"),
                tool_type=ToolType(n.get("tool_type", "llm")),
                input_schema=n.get("input_schema", {}),
                output_schema=n.get("output_schema", {}),
                status=NodeStatus.idle,
                result=None,
                error=None,
                execution_method=None,
            ))
        return Workflow(
            workflow_id=data.get("workflow_id", f"wf_{uuid.uuid4().hex[:8]}"),
            title=data.get("title", "New Workflow"),
            title_zh=data.get("title_zh", "新工作流"),
            description=data.get("description", ""),
            nodes=nodes,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
    except Exception:
        return None
