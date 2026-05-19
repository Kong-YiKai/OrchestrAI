export type NodeStatus = 'idle' | 'running' | 'complete' | 'error';
export type ExecutionMethod = 'api' | 'playwright' | 'simulated' | null;
export type ToolType = 'api' | 'web_automation' | 'llm' | 'code';
export type NodeType = 'phase' | 'task';

const EXECUTION_METHODS = ['api', 'playwright', 'simulated'] as const;

/** Narrows an unknown wire value to ExecutionMethod; unknown strings coerce to null. */
export function toExecutionMethod(value: unknown): ExecutionMethod {
  if (value === null || value === undefined) return null;
  return EXECUTION_METHODS.includes(value as (typeof EXECUTION_METHODS)[number])
    ? (value as ExecutionMethod)
    : null;
}

export interface NodeResult {
  raw: Record<string, unknown>;
  summary: string;
  summary_zh: string;
}

export interface WorkflowNode {
  node_id: string;
  order: number;
  title: string;
  title_zh: string;
  description: string;
  description_zh: string;
  assigned_ai: string;
  assigned_tool: string;
  tool_type: ToolType;
  input_schema: Record<string, string>;
  output_schema: Record<string, string>;
  node_type: NodeType;
  parent_node_id: string | null;
  depends_on: string[];
  parallel_group: string | null;
  status: NodeStatus;
  result: NodeResult | null;
  error: string | null;
  execution_method: ExecutionMethod;
}

export interface Workflow {
  workflow_id: string;
  title: string;
  title_zh: string;
  description: string;
  nodes: WorkflowNode[];
  created_at: string;
}

/**
 * Lightweight projection of a workflow for the /workflows list page.
 * Backend returns this shape from `GET /api/workflows` — no `nodes` array,
 * just a count. Hydrate via `fetchWorkflow(id)` when the user drills in.
 */
export interface WorkflowSummary {
  workflow_id: string;
  title: string;
  title_zh: string;
  description: string;
  node_count: number;
  created_at: string;
}
