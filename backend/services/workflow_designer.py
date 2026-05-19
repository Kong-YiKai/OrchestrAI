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
from models.workflow import Workflow, WorkflowNode, NodeStatus, NodeType, ToolType

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

    stop_reason: str | None = None
    try:
        await _emit_log(sio_emit_fn, session_id, "analyzing", "正在理解需求上下文...")
        async with _client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=12000,
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
            final_message = await stream.get_final_message()
            stop_reason = final_message.stop_reason
    except Exception as e:
        await _emit_log(sio_emit_fn, session_id, "error", f"生成失败: {str(e)[:40]}")
        return None

    workflow = _parse_workflow(full_text)
    if not workflow:
        tail = full_text[-300:].replace('\n', ' ')
        print(f"[designer] parse failed. stop_reason={stop_reason} len={len(full_text)} tail={tail}")
        detail = f"(stop_reason={stop_reason})" if stop_reason == "max_tokens" else ""
        await _emit_log(
            sio_emit_fn,
            session_id,
            "generating",
            f"LLM JSON 不完整，已切换到确定性工作流生成 {detail}".strip(),
        )
        workflow = _build_fallback_workflow(state)

    await _emit_log(sio_emit_fn, session_id, "done", f"工作流设计完成，共 {len(workflow.nodes)} 个节点")
    await sio_emit_fn("building:complete", {"node_count": len(workflow.nodes)}, room=session_id)

    add_history_log(session_id, "工作流生成", f"{workflow.title}（{len(workflow.nodes)} 个节点）")
    return workflow


def _extract_raw_json(text: str) -> str | None:
    match = re.search(r'<workflow_json>(.*?)</workflow_json>', text, re.DOTALL)
    if match:
        return match.group(1).strip()
    # Fallback: balanced-brace scan for the first JSON object containing "nodes"
    start = 0
    while True:
        idx = text.find('{', start)
        if idx == -1:
            return None
        depth = 0
        in_str = False
        escape = False
        for i in range(idx, len(text)):
            ch = text[i]
            if escape:
                escape = False
                continue
            if ch == '\\':
                escape = True
                continue
            if ch == '"':
                in_str = not in_str
                continue
            if in_str:
                continue
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    candidate = text[idx:i + 1]
                    if '"nodes"' in candidate:
                        return candidate
                    break
        start = idx + 1


def _clean_raw_json(raw: str) -> str:
    raw = raw.strip()
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```\s*$', '', raw)
    # Strip trailing commas before } or ]
    raw = re.sub(r',(\s*[}\]])', r'\1', raw)
    return raw.strip()


def _parse_workflow(text: str) -> Workflow | None:
    raw = _extract_raw_json(text)
    if not raw:
        return None
    raw = _clean_raw_json(raw)
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
                node_type=n.get("node_type", "task"),
                parent_node_id=n.get("parent_node_id"),
                depends_on=n.get("depends_on", []),
                parallel_group=n.get("parallel_group"),
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


def _default_plan_nodes() -> list[dict]:
    return [
        {
            "order": 1,
            "title": "需求分析与产品定义",
            "description": "梳理目标用户、核心场景、边界限制和验收标准。",
            "recommended_ai": "claude",
            "node_type": "phase",
            "depends_on": [],
        },
        {
            "order": 2,
            "title": "系统架构与技术方案",
            "description": "定义前后端边界、数据模型、接口契约和模拟范围。",
            "recommended_ai": "claude",
            "node_type": "phase",
            "depends_on": [1],
        },
        {
            "order": 3,
            "title": "数据与后端服务",
            "description": "准备模拟数据，设计 API，并实现核心业务流程。",
            "recommended_ai": "gpt",
            "node_type": "phase",
            "depends_on": [2],
        },
        {
            "order": 4,
            "title": "前端界面与交互流程",
            "description": "实现用户可操作的搜索、选择、确认和结果展示界面。",
            "recommended_ai": "gpt",
            "node_type": "phase",
            "depends_on": [2],
        },
        {
            "order": 5,
            "title": "联调与异常状态",
            "description": "对接前后端，覆盖加载、失败、空状态和边界场景。",
            "recommended_ai": "claude",
            "node_type": "task",
            "depends_on": [3, 4],
        },
        {
            "order": 6,
            "title": "测试验收与发布说明",
            "description": "运行测试，整理限制说明，并准备部署或演示交付。",
            "recommended_ai": "claude",
            "node_type": "phase",
            "depends_on": [5],
        },
    ]


def _tool_for_node(title: str, ai: str) -> tuple[str, ToolType]:
    if "前端" in title:
        return "Next.js / React", ToolType.code
    if "后端" in title or "API" in title or "数据" in title:
        return "Python FastAPI", ToolType.code
    if "测试" in title or "验收" in title:
        return "Evaluator", ToolType.llm
    return "Claude", ToolType.llm if ai == "claude" else ToolType.code


def _build_fallback_workflow(state: ConversationState) -> Workflow:
    preview = state.plan_nodes_preview or _default_plan_nodes()
    request = state.original_request or "新工作流"
    title_zh = (request[:32].strip("，。,. ") or "产品开发") + "工作流"

    order_to_node_id: dict[int, str] = {}
    for item in preview:
        order = int(item.get("order", len(order_to_node_id) + 1))
        order_to_node_id[order] = f"node_{uuid.uuid4().hex[:8]}"

    nodes: list[WorkflowNode] = []
    for idx, item in enumerate(preview, start=1):
        order = int(item.get("order", idx))
        node_id = order_to_node_id[order]
        title = item.get("title", f"Step {order}")
        description = item.get("description", "")
        ai = item.get("recommended_ai", "claude")
        tool, tool_type = _tool_for_node(title, ai)
        depends_on_orders = item.get("depends_on") or ([] if order == 1 else [order - 1])
        depends_on = [
            order_to_node_id[o]
            for o in depends_on_orders
            if isinstance(o, int) and o in order_to_node_id
        ]
        node_type = item.get("node_type", "phase")
        if node_type not in ("phase", "task"):
            node_type = "phase"
        parallel_group = None
        if len(depends_on_orders) == 1:
            siblings = [
                other
                for other in preview
                if other is not item and other.get("depends_on") == depends_on_orders
            ]
            if siblings:
                parallel_group = f"pg_{depends_on_orders[0]}"

        nodes.append(
            WorkflowNode(
                node_id=node_id,
                order=order,
                title=title,
                title_zh=title,
                description=description,
                description_zh=description,
                assigned_ai=ai,
                assigned_tool=tool,
                tool_type=tool_type,
                node_type=NodeType(node_type),
                parent_node_id=None,
                depends_on=depends_on,
                parallel_group=parallel_group,
                input_schema={},
                output_schema={"result": "阶段产出"},
                status=NodeStatus.idle,
            )
        )

    return Workflow(
        workflow_id=f"wf_{uuid.uuid4().hex[:8]}",
        title=title_zh,
        title_zh=title_zh,
        description=state.plan_summary or f"围绕“{request}”生成的阶段级工作流。",
        nodes=nodes,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
