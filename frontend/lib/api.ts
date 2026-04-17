const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

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
