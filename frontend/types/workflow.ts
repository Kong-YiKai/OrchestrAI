export type NodeStatus = 'idle' | 'running' | 'complete' | 'error';
export type ExecutionMethod = 'api' | 'playwright' | 'simulated' | null;
export type ToolType = 'api' | 'web_automation' | 'llm' | 'code';

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
