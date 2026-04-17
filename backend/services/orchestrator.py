import json
import re
import uuid
import asyncio
from datetime import datetime, timezone

import anthropic

from config import settings
from models.workflow import Workflow, WorkflowNode, NodeStatus
from models.chat import AI_PERSONAS, ChatMessage, MessageType
from socket_manager import sio

WORKFLOW_GENERATION_PROMPT = """You are OrchestrAI's orchestrator — a powerful AI that helps users build software and workflows.

When a user describes an idea, you MUST:
1. First respond conversationally in the SAME LANGUAGE as the user (Chinese if they write Chinese, English if English). Show enthusiasm and briefly explain what workflow you'll create.
2. Then output a workflow JSON block wrapped in <workflow_json> tags.

The workflow JSON MUST follow this exact schema:
{
  "workflow_id": "wf_<8 random alphanumeric chars>",
  "title": "<concise English title>",
  "title_zh": "<concise Chinese title>",
  "description": "<brief English description>",
  "nodes": [
    {
      "node_id": "node_<N>",
      "order": <N starting from 1>,
      "title": "<step title in English>",
      "title_zh": "<step title in Chinese>",
      "description": "<what this step does, 1-2 sentences>",
      "description_zh": "<Chinese description>",
      "assigned_ai": "<one of: claude, gpt, gemini, grok>",
      "assigned_tool": "<specific tool, API, or service name>",
      "tool_type": "<one of: api, web_automation, llm, code>",
      "input_schema": {"<key>": "<type>"},
      "output_schema": {"<key>": "<type>"},
      "status": "idle",
      "result": null,
      "error": null,
      "execution_method": null
    }
  ]
}

Rules:
- Generate 3-5 nodes. Each node should be a meaningful, executable step.
- Choose the most appropriate AI for each step (vary them for visual interest).
- assigned_tool should be a real tool/API/service name (e.g. "OpenWeatherMap API", "GPT-4o Vision", "Playwright Browser", "Python script").
- tool_type "api" = has a direct REST API; "llm" = AI model call; "web_automation" = needs browser; "code" = runs code.
- Your conversational response comes FIRST, then the <workflow_json> block.
- Do NOT put anything after the </workflow_json> closing tag.

Example structure of your response:
<conversational response here>

<workflow_json>
{ ...json... }
</workflow_json>"""


def _parse_workflow_json(text: str) -> dict | None:
    match = re.search(r"<workflow_json>\s*(.*?)\s*</workflow_json>", text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError:
        return None


def _extract_conversational_part(text: str) -> str:
    idx = text.find("<workflow_json>")
    if idx == -1:
        return text.strip()
    return text[:idx].strip()


async def generate_workflow_and_respond(
    user_message: str, session_id: str
) -> Workflow | None:
    """
    Main entry point: stream Claude's response into chat, parse workflow JSON,
    then drip-feed nodes to the frontend with animation delays.
    """
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    message_id = f"msg_{uuid.uuid4().hex[:8]}"
    claude_persona = AI_PERSONAS["claude"]

    # Signal typing
    await sio.emit(
        "chat:typing", {"sender_id": "claude", "is_typing": True}, room=session_id
    )

    full_text = ""
    conversational_done = False

    try:
        async with client.messages.stream(
            model="claude-opus-4-5",
            max_tokens=4096,
            system=WORKFLOW_GENERATION_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        ) as stream:
            async for token in stream.text_stream:
                full_text += token

                # Only stream conversational part (before <workflow_json>)
                if not conversational_done:
                    if "<workflow_json>" in full_text:
                        conversational_done = True
                        # Flush remaining conversational text before the tag
                        conv_part = _extract_conversational_part(full_text)
                        # Already streamed up to here; nothing more to emit
                    else:
                        await sio.emit(
                            "chat:stream_token",
                            {
                                "message_id": message_id,
                                "token": token,
                                "sender_id": "claude",
                            },
                            room=session_id,
                        )
    finally:
        await sio.emit(
            "chat:typing", {"sender_id": "claude", "is_typing": False}, room=session_id
        )

    # Emit the complete conversational message
    conv_text = _extract_conversational_part(full_text)
    if conv_text:
        await sio.emit(
            "chat:message",
            ChatMessage(
                message_id=message_id,
                sender=claude_persona,
                content=conv_text,
                message_type=MessageType.text,
                timestamp=datetime.now(timezone.utc).isoformat(),
                is_streaming=False,
            ).model_dump(),
            room=session_id,
        )

    # Parse workflow JSON
    workflow_data = _parse_workflow_json(full_text)
    if not workflow_data:
        await sio.emit(
            "chat:message",
            ChatMessage(
                message_id=f"msg_{uuid.uuid4().hex[:8]}",
                sender=AI_PERSONAS["orchestrai"],
                content="抱歉，生成工作流时出现问题，请重试。\nSorry, failed to generate workflow. Please try again.",
                message_type=MessageType.system,
                timestamp=datetime.now(timezone.utc).isoformat(),
            ).model_dump(),
            room=session_id,
        )
        return None

    # Build Workflow object
    nodes = [WorkflowNode(**n) for n in workflow_data.get("nodes", [])]
    workflow = Workflow(
        workflow_id=workflow_data.get("workflow_id", f"wf_{uuid.uuid4().hex[:8]}"),
        title=workflow_data.get("title", "Workflow"),
        title_zh=workflow_data.get("title_zh", "工作流"),
        description=workflow_data.get("description", ""),
        nodes=nodes,
        created_at=datetime.now(timezone.utc).isoformat(),
    )

    # Drip-feed nodes with animation delay
    for node in workflow.nodes:
        await asyncio.sleep(0.6)
        await sio.emit("workflow:node_appeared", node.model_dump(), room=session_id)

    await sio.emit(
        "workflow:generation_complete",
        {"workflow_id": workflow.workflow_id},
        room=session_id,
    )

    return workflow
