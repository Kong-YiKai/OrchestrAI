import type { Workflow, WorkflowNode, WorkflowSummary } from '@/types/workflow';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export async function fetchWorkflow(workflowId: string): Promise<Workflow | null> {
  const res = await fetch(`${BASE}/workflow/${workflowId}`);
  if (!res.ok) return null;
  return (await res.json()) as Workflow;
}

/** List all workflows as lightweight summaries (no node payload), newest first. */
export async function listWorkflows(): Promise<WorkflowSummary[]> {
  const res = await fetch(`${BASE}/workflows`);
  if (!res.ok) throw new Error(`listWorkflows failed: ${res.status}`);
  return (await res.json()) as WorkflowSummary[];
}

export async function runWorkflow(
  workflowId: string,
  sessionId: string,
  opts: { mock?: boolean } = {},
) {
  // Mock mode defaults to true — the canvas Run button is a demo trigger, and
  // a real execution path still requires external API keys that the dev setup
  // may not have. Call sites that want real execution can pass `mock: false`.
  const mock = opts.mock ?? true;
  const res = await fetch(`${BASE}/execution/run/${workflowId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, mock }),
  });
  return res.json();
}

export async function retryNode(nodeId: string, sessionId: string) {
  const res = await fetch(`${BASE}/execution/node/${nodeId}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, mock: true }),
  });
  return res.json();
}

export async function runNode(nodeId: string, sessionId: string, opts: { mock?: boolean } = {}) {
  const mock = opts.mock ?? true;
  const res = await fetch(`${BASE}/execution/node/${nodeId}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, mock }),
  });
  return res.json();
}

export async function stopNode(nodeId: string, sessionId: string) {
  const res = await fetch(`${BASE}/execution/node/${nodeId}/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  return res.json();
}

export async function updateNodeModel(
  workflowId: string,
  nodeId: string,
  assignedAi: string
) {
  return updateWorkflowNode(workflowId, nodeId, { assigned_ai: assignedAi });
}

export async function updateWorkflowNode(
  workflowId: string,
  nodeId: string,
  patch: Partial<
    Pick<
      WorkflowNode,
      | 'title'
      | 'title_zh'
      | 'description'
      | 'description_zh'
      | 'assigned_ai'
      | 'assigned_tool'
      | 'tool_type'
      | 'node_type'
      | 'parent_node_id'
      | 'depends_on'
      | 'parallel_group'
      | 'input_schema'
      | 'output_schema'
    >
  >,
) {
  const res = await fetch(`${BASE}/workflow/${workflowId}/node/${nodeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return res.json();
}

export async function subdivideWorkflowNode(
  workflowId: string,
  nodeId: string,
  opts: { child_count?: number } = {},
) {
  const res = await fetch(`${BASE}/workflow/${workflowId}/node/${nodeId}/subdivide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ child_count: opts.child_count ?? 4 }),
  });
  if (!res.ok) throw new Error(`subdivideWorkflowNode failed: ${res.status}`);
  return (await res.json()) as {
    status: 'ok';
    workflow_id: string;
    parent_node_id: string;
    nodes: WorkflowNode[];
  };
}
