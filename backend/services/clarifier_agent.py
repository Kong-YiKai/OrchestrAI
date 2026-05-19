import json
import re
import uuid
from pathlib import Path
import anthropic
from typing import Callable
from datetime import datetime, timezone
from config import settings
from models.chat import AI_PERSONAS, ChatMessage, MessageType
from services.conversation_manager import (
    ConversationState,
    add_clarification,
    answer_clarification,
    append_history,
    set_plan,
    add_history_log,
    get_state,
)

_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "clarifier_system.md"
CLARIFIER_SYSTEM = _PROMPT_PATH.read_text(encoding="utf-8")


FALLBACK_OPTIONS = [
    {"id": "prototype", "label": "快速原型", "meta": "先做可演示版本"},
    {"id": "mvp", "label": "MVP 产品", "meta": "保留核心功能，适合继续迭代"},
    {"id": "phased", "label": "分阶段完整方案", "meta": "先规划阶段，再逐步细分"},
]


def _fallback_response() -> dict:
    return {
        "action": "ask",
        "chat_message": "我需要再确认一下目标范围，避免生成过于笼统的工作流。",
        "questions": [
            {
                "id": "fallback",
                "question": "你希望这次先生成哪种范围的工作流？",
                "hint": "后续可以在画布里继续细分节点。",
                "options": FALLBACK_OPTIONS,
            }
        ],
    }


def _normalize_response(data: dict) -> dict:
    action = data.get("action", "ask")
    if action == "ask":
        questions = data.get("questions") or _fallback_response()["questions"]
        normalized = []
        for q in questions:
            options = q.get("options") or FALLBACK_OPTIONS
            normalized.append({
                **q,
                "id": q.get("id", uuid.uuid4().hex[:6]),
                "question": q.get("question", "你希望这次先生成哪种范围的工作流？"),
                "hint": q.get("hint", ""),
                "options": options,
            })
        return {
            **data,
            "action": "ask",
            "chat_message": data.get("chat_message") or "我需要再确认几个关键选择。",
            "questions": normalized,
        }
    if action == "present_plan":
        return {
            **data,
            "action": "present_plan",
            "chat_message": data.get("chat_message") or "我已经整理好计划，请确认是否开始生成工作流。",
            "plan": data.get("plan", {}),
        }
    return _fallback_response()


def _record_answers_from_user_message(
    session_id: str,
    user_message: str,
    state: ConversationState,
) -> bool:
    pending = [c for c in state.clarifications if c.get("status") != "answered"]
    if not pending:
        return False

    changed = False
    qa_pairs = re.findall(r"Q:\s*(.*?)\s*A:\s*(.*?)(?=\n\s*Q:|$)", user_message, re.DOTALL)
    for question_text, answer_text in qa_pairs:
        answer = answer_text.strip()
        if not answer:
            continue
        normalized_q = re.sub(r"\s+", "", question_text)
        for c in pending:
            normalized_existing = re.sub(r"\s+", "", c.get("question", ""))
            if normalized_existing and (
                normalized_existing in normalized_q or normalized_q in normalized_existing
            ):
                answer_clarification(session_id, c["id"], answer)
                changed = True
                break

    pending = [c for c in state.clarifications if c.get("status") != "answered"]
    if not changed and len(pending) == 1 and user_message.strip():
        answer_clarification(session_id, pending[0]["id"], user_message.strip())
        changed = True

    return changed


def _build_deterministic_plan_response(state: ConversationState) -> dict:
    request = state.original_request or "新工作流"
    answered = [c for c in state.clarifications if c.get("status") == "answered"]
    scope = next((c.get("answer", "") for c in answered if c.get("answer")), "分阶段完整方案")
    title = request[:36].strip("，。,. ") or "产品开发工作流"
    nodes = [
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
    return {
        "action": "present_plan",
        "chat_message": f"根据你的回答，我会按“{scope}”生成阶段级工作流。请确认方案👇",
        "plan": {
            "title": f"{title} · 开发工作流",
            "summary": (
                f"围绕“{request}”生成一个阶段级工作流，先覆盖需求、架构、前后端、联调、测试和发布。"
                "如果目标超出现阶段 AI 可完整自动实现的范围，工作流会引导为模拟产品或分阶段 MVP。"
            ),
            "nodes": nodes,
            "confirmation_prompt": "计划如上，是否开始生成工作流？",
        },
    }


def _extract_json(text: str) -> dict:
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        try:
            return _normalize_response(json.loads(match.group()))
        except json.JSONDecodeError:
            pass
    return _fallback_response()


async def clarify(
    session_id: str,
    user_message: str,
    state: ConversationState,
    sio_emit_fn: Callable,
) -> None:
    messages = state.history + [{"role": "user", "content": user_message}]
    recorded_answers = _record_answers_from_user_message(session_id, user_message, state)

    if recorded_answers and all(c.get("status") == "answered" for c in state.clarifications):
        parsed = _build_deterministic_plan_response(state)
        action = "present_plan"
        public_message = parsed["chat_message"]
    else:
        full_text = ""
        try:
            async with _client.messages.stream(
                model="claude-sonnet-4-6",
                max_tokens=1024,
                system=CLARIFIER_SYSTEM,
                messages=messages,
            ) as stream:
                async for token in stream.text_stream:
                    full_text += token
        except Exception:
            full_text = json.dumps(_fallback_response(), ensure_ascii=False)

        parsed = _extract_json(full_text)
        action = parsed.get("action", "ask")
        if action == "ask" and recorded_answers:
            parsed = _build_deterministic_plan_response(state)
            action = "present_plan"
        public_message = parsed.get("chat_message") or "我已经整理好下一步。"

    await sio_emit_fn(
        "chat:message",
        ChatMessage(
            message_id=f"msg_{uuid.uuid4().hex[:8]}",
            sender=AI_PERSONAS["orchestrai"],
            content=public_message,
            message_type=MessageType.text,
            timestamp=datetime.now(timezone.utc).isoformat(),
        ).model_dump(),
        room=session_id,
    )
    append_history(session_id, "assistant", public_message)

    if action == "ask":
        questions = parsed.get("questions", [])
        for q in questions:
            add_clarification(
                session_id,
                q.get("id", uuid.uuid4().hex[:6]),
                q.get("question", ""),
                options=q.get("options", []),
                hint=q.get("hint", ""),
            )
        await sio_emit_fn("clarification:update", {"questions": questions}, room=session_id)
        add_history_log(session_id, "澄清问题", f"提出 {len(questions)} 个问题")
    else:
        plan = parsed.get("plan", {})
        nodes_preview = plan.get("nodes", [])
        set_plan(session_id, plan.get("summary", ""), nodes_preview)
        await sio_emit_fn("clarification:plan_ready", {"plan": plan}, room=session_id)
        add_history_log(session_id, "计划呈现", plan.get("title", ""))

    updated_state = get_state(session_id)
    await sio_emit_fn(
        "history:update",
        {"entries": updated_state.history_log},
        room=session_id,
    )
