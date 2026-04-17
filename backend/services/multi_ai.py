import asyncio
import uuid
from datetime import datetime, timezone

from models.chat import AI_PERSONAS, ChatMessage, MessageType
from models.workflow import Workflow
from socket_manager import sio
from config import settings


async def _call_openai_comment(workflow: Workflow, user_message: str) -> str:
    """GPT-4o-mini adds a brief analytical comment on the workflow."""
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.openai_api_key)

        # Detect language from user message (simple heuristic)
        is_chinese = any("\u4e00" <= c <= "\u9fff" for c in user_message)
        lang_instruction = "Respond in Chinese." if is_chinese else "Respond in English."

        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=100,
            messages=[
                {
                    "role": "system",
                    "content": f"You are GPT-4o, an AI assistant in a collaborative chat. {lang_instruction} Be concise (1-2 sentences). Add an analytical perspective on the workflow.",
                },
                {
                    "role": "user",
                    "content": f"A workflow was just generated for: '{workflow.title}'. Steps: {[n.title for n in workflow.nodes]}. Add a brief analytical comment.",
                },
            ],
        )
        return response.choices[0].message.content or ""
    except Exception as e:
        print(f"[multi_ai] OpenAI error: {e}")
        return ""


async def _call_gemini_comment(workflow: Workflow, user_message: str) -> str:
    """Gemini adds a brief UX-focused comment."""
    try:
        import google.generativeai as genai
        genai.configure(api_key=settings.google_api_key)
        model = genai.GenerativeModel("gemini-1.5-flash")

        is_chinese = any("\u4e00" <= c <= "\u9fff" for c in user_message)
        lang_instruction = "用中文回复。" if is_chinese else "Respond in English."

        prompt = f"{lang_instruction} You are Gemini in a collaborative AI chat. Add a brief (1-2 sentence) enthusiastic comment about the UX potential of this workflow: '{workflow.title}'. Steps: {[n.title for n in workflow.nodes]}"
        response = await asyncio.to_thread(model.generate_content, prompt)
        return response.text or ""
    except Exception as e:
        print(f"[multi_ai] Gemini error: {e}")
        return ""


async def fan_out_ai_comments(
    workflow: Workflow, user_message: str, session_id: str
) -> None:
    """
    After Claude generates a workflow, GPT and Gemini chime in with brief comments.
    Staggered delays so they appear naturally in the chat.
    """
    # GPT after 2s
    await asyncio.sleep(2.0)
    gpt_comment = await _call_openai_comment(workflow, user_message)
    if gpt_comment:
        await sio.emit(
            "chat:message",
            ChatMessage(
                message_id=f"msg_{uuid.uuid4().hex[:8]}",
                sender=AI_PERSONAS["gpt"],
                content=gpt_comment,
                message_type=MessageType.text,
                timestamp=datetime.now(timezone.utc).isoformat(),
                workflow_ref=workflow.workflow_id,
            ).model_dump(),
            room=session_id,
        )

    # Gemini after 2 more seconds
    await asyncio.sleep(2.0)
    gemini_comment = await _call_gemini_comment(workflow, user_message)
    if gemini_comment:
        await sio.emit(
            "chat:message",
            ChatMessage(
                message_id=f"msg_{uuid.uuid4().hex[:8]}",
                sender=AI_PERSONAS["gemini"],
                content=gemini_comment,
                message_type=MessageType.text,
                timestamp=datetime.now(timezone.utc).isoformat(),
                workflow_ref=workflow.workflow_id,
            ).model_dump(),
            room=session_id,
        )
