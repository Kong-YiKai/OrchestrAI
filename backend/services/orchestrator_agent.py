import json
import re
from pathlib import Path
import anthropic
from config import settings

_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "orchestrator_system.md"
ORCHESTRATOR_SYSTEM = _PROMPT_PATH.read_text(encoding="utf-8")


def _parse_route_response(raw: str) -> dict:
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return {"route": "casual_chat", "brief_reason": "fallback"}


async def route_message(user_message: str, history: list[dict]) -> dict:
    messages = history[-6:] + [{"role": "user", "content": user_message}]
    try:
        response = await _client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=64,
            system=ORCHESTRATOR_SYSTEM,
            messages=messages,
        )
        return _parse_route_response(response.content[0].text.strip())
    except Exception:
        return {"route": "casual_chat", "brief_reason": "fallback"}
