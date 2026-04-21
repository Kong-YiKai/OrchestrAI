from pydantic import BaseModel
from typing import Optional, Literal
from enum import Enum


class MessageType(str, Enum):
    text = "text"
    workflow_generated = "workflow_generated"
    node_update = "node_update"
    system = "system"
    clarification = "clarification"
    plan_ready = "plan_ready"
    building = "building"


class AISender(BaseModel):
    id: str
    name: str
    avatar: str
    model: str
    color: str


class ChatMessage(BaseModel):
    message_id: str
    sender: AISender
    content: str
    content_en: str = ""
    message_type: MessageType = MessageType.text
    timestamp: str
    is_streaming: bool = False
    workflow_ref: Optional[str] = None


class ClarificationOption(BaseModel):
    id: str
    label: str
    meta: str = ""


class ClarificationQuestion(BaseModel):
    id: str
    question: str
    hint: str = ""
    answer: str = ""
    options: list[ClarificationOption] = []
    status: Literal["pending", "answered"] = "pending"


class PlanNode(BaseModel):
    order: int
    title: str
    description: str
    recommended_ai: str = "claude"


class PlanPayload(BaseModel):
    title: str
    summary: str
    nodes: list[PlanNode]
    confirmation_prompt: str


class BuildingLog(BaseModel):
    log_id: str
    timestamp: str
    type: Literal["thinking", "analyzing", "generating", "deciding", "done", "error"]
    message: str
    detail: str = ""
    agent: str = "Workflow Designer"


class HistoryEntry(BaseModel):
    entry_id: str
    timestamp: str
    action: str
    detail: str = ""


AI_PERSONAS = {
    "claude": AISender(
        id="claude",
        name="Claude",
        avatar="/avatars/claude.png",
        model="claude-opus-4-5",
        color="#D97706",
    ),
    "gpt": AISender(
        id="gpt",
        name="GPT-4o",
        avatar="/avatars/gpt.png",
        model="gpt-4o-mini",
        color="#10B981",
    ),
    "gemini": AISender(
        id="gemini",
        name="Gemini",
        avatar="/avatars/gemini.png",
        model="gemini-1.5-flash",
        color="#3B82F6",
    ),
    "grok": AISender(
        id="grok",
        name="Grok",
        avatar="/avatars/grok.png",
        model="grok-2",
        color="#8B5CF6",
    ),
    "orchestrai": AISender(
        id="orchestrai",
        name="OrchestrAI",
        avatar="/avatars/orchestrai.png",
        model="system",
        color="#EC4899",
    ),
}
