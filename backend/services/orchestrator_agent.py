import json
import re
from pathlib import Path
import anthropic
from config import settings

_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "orchestrator_system.md"
ORCHESTRATOR_SYSTEM = _PROMPT_PATH.read_text(encoding="utf-8")


DEV_HINTS = (
    "创建",
    "构建",
    "开发",
    "设计",
    "生成",
    "自动化",
    "工作流",
    "系统",
    "产品",
    "应用",
    "网站",
    "平台",
    "前端",
    "后端",
    "测试",
    "发布",
    "build",
    "create",
    "develop",
    "design",
    "workflow",
    "automate",
    "app",
    "system",
    "product",
    "website",
    "frontend",
    "backend",
)


CASUAL_ONLY_HINTS = (
    "你好",
    "您好",
    "hello",
    "hi",
    "what can you do",
    "你能做什么",
)


def _looks_like_development_request(user_message: str) -> bool:
    text = user_message.strip().lower()
    if not text:
        return False
    if text in CASUAL_ONLY_HINTS:
        return False
    return any(hint in text for hint in DEV_HINTS)


def _parse_route_response(raw: str) -> dict:
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return {"route": "casual_chat", "brief_reason": "fallback"}


async def route_message(user_message: str, history: list[dict]) -> dict:
    if _looks_like_development_request(user_message):
        return {
            "route": "development_request",
            "brief_reason": "deterministic build/workflow keyword match",
        }

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
