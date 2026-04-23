import type { Workflow, WorkflowSummary } from '@/types/workflow';

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

export async function runWorkflow(workflowId: string, sessionId: string) {
  const res = await fetch(`${BASE}/execution/run/${workflowId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  return res.json();
}

export async function retryNode(nodeId: string, sessionId: string) {
  const res = await fetch(`${BASE}/execution/node/${nodeId}/retry`, {
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
  const res = await fetch(`${BASE}/workflow/${workflowId}/node/${nodeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assigned_ai: assignedAi }),
  });
  return res.json();
}
