"""Workflow graph refinement helpers.

The first implementation is deterministic so users can subdivide a stage on the
canvas without waiting for another LLM call. Later phases can replace the child
node generator with a model-backed planner while keeping the same graph shape.
"""

from __future__ import annotations

import uuid

from models.workflow import NodeStatus, NodeType, ToolType, Workflow, WorkflowNode


def subdivide_node(workflow: Workflow, node_id: str, child_count: int = 4) -> list[WorkflowNode]:
    parent = next((node for node in workflow.nodes if node.node_id == node_id), None)
    if parent is None:
        return []

    count = max(3, min(child_count, 6))
    parent.node_type = NodeType.phase
    existing_children = [node for node in workflow.nodes if node.parent_node_id == node_id]
    if existing_children:
        return existing_children

    base_order = max((node.order for node in workflow.nodes), default=parent.order) + 1
    group_id = f"pg_{node_id}_{uuid.uuid4().hex[:6]}"
    prefix = node_id.replace("node_", "")[:10]

    plan = WorkflowNode(
        node_id=f"node_{prefix}_plan_{uuid.uuid4().hex[:4]}",
        order=base_order,
        title=f"Plan {parent.title or parent.title_zh}",
        title_zh=f"规划：{parent.title_zh or parent.title}",
        description=f"Break down the phase '{parent.title}' into concrete acceptance criteria, files, and execution boundaries.",
        description_zh=f"把“{parent.title_zh or parent.title}”拆成可验收的范围、文件边界和执行顺序。",
        assigned_ai="claude",
        assigned_tool="Claude",
        tool_type=ToolType.llm,
        node_type=NodeType.task,
        parent_node_id=node_id,
        depends_on=[node_id],
        status=NodeStatus.idle,
    )
    build_a = WorkflowNode(
        node_id=f"node_{prefix}_a_{uuid.uuid4().hex[:4]}",
        order=base_order + 1,
        title=f"Build core track for {parent.title or parent.title_zh}",
        title_zh=f"并行实现 A：{parent.title_zh or parent.title}",
        description="Implement the primary path for this phase. This branch can run in parallel with the companion track.",
        description_zh="实现该阶段的主路径；可与另一个实现分支并行推进。",
        assigned_ai="gpt",
        assigned_tool=parent.assigned_tool or "Code",
        tool_type=parent.tool_type if parent.tool_type != ToolType.llm else ToolType.code,
        node_type=NodeType.task,
        parent_node_id=node_id,
        depends_on=[plan.node_id],
        parallel_group=group_id,
        status=NodeStatus.idle,
    )
    build_b = WorkflowNode(
        node_id=f"node_{prefix}_b_{uuid.uuid4().hex[:4]}",
        order=base_order + 2,
        title=f"Build companion track for {parent.title or parent.title_zh}",
        title_zh=f"并行实现 B：{parent.title_zh or parent.title}",
        description="Implement the secondary or integration path for this phase in parallel with the primary track.",
        description_zh="实现该阶段的辅助或集成路径，与主实现分支并行推进。",
        assigned_ai="gpt",
        assigned_tool=parent.assigned_tool or "Code",
        tool_type=parent.tool_type if parent.tool_type != ToolType.llm else ToolType.code,
        node_type=NodeType.task,
        parent_node_id=node_id,
        depends_on=[plan.node_id],
        parallel_group=group_id,
        status=NodeStatus.idle,
    )
    verify = WorkflowNode(
        node_id=f"node_{prefix}_verify_{uuid.uuid4().hex[:4]}",
        order=base_order + 3,
        title=f"Verify {parent.title or parent.title_zh}",
        title_zh=f"验证：{parent.title_zh or parent.title}",
        description="Merge the parallel tracks, run checks, and summarize what still needs human review.",
        description_zh="汇合并行分支，运行检查，并总结仍需人工确认的部分。",
        assigned_ai="claude",
        assigned_tool="Evaluator",
        tool_type=ToolType.llm,
        node_type=NodeType.task,
        parent_node_id=node_id,
        depends_on=[build_a.node_id, build_b.node_id],
        status=NodeStatus.idle,
    )
    children = [plan, build_a, build_b, verify]

    if count > 4:
        extra = WorkflowNode(
            node_id=f"node_{prefix}_polish_{uuid.uuid4().hex[:4]}",
            order=base_order + 4,
            title=f"Polish {parent.title or parent.title_zh}",
            title_zh=f"打磨：{parent.title_zh or parent.title}",
            description="Apply final UX, documentation, or reliability polish after verification.",
            description_zh="在验证后做体验、文档或可靠性打磨。",
            assigned_ai="claude",
            assigned_tool="Claude",
            tool_type=ToolType.llm,
            node_type=NodeType.task,
            parent_node_id=node_id,
            depends_on=[verify.node_id],
            status=NodeStatus.idle,
        )
        children.append(extra)

    workflow.nodes.extend(children)
    return children
