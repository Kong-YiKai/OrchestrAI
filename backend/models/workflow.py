from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from enum import Enum


class NodeStatus(str, Enum):
    idle = "idle"
    running = "running"
    complete = "complete"
    error = "error"


class ExecutionMethod(str, Enum):
    api = "api"
    playwright = "playwright"
    simulated = "simulated"


class ToolType(str, Enum):
    api = "api"
    web_automation = "web_automation"
    llm = "llm"
    code = "code"


class NodeResult(BaseModel):
    raw: Dict[str, Any] = {}
    summary: str = ""
    summary_zh: str = ""


class WorkflowNode(BaseModel):
    node_id: str
    order: int
    title: str
    title_zh: str
    description: str
    description_zh: str
    assigned_ai: str = "claude"
    assigned_tool: str = ""
    tool_type: ToolType = ToolType.llm
    input_schema: Dict[str, str] = {}
    output_schema: Dict[str, str] = {}
    status: NodeStatus = NodeStatus.idle
    result: Optional[NodeResult] = None
    error: Optional[str] = None
    execution_method: Optional[ExecutionMethod] = None


class Workflow(BaseModel):
    workflow_id: str
    title: str
    title_zh: str
    description: str
    nodes: List[WorkflowNode] = []
    created_at: str = ""
