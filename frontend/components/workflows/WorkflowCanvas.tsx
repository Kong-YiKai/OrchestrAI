'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type Edge,
  type NodeTypes,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Connection,
  type OnNodesChange,
  type OnEdgesChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Workflow as WorkflowIcon } from 'lucide-react';
import { TaskNodeCard, type TaskNode, type TaskNodeData, type TaskNodeStatus } from './TaskNodeCard';
import { NodeDetailDrawer } from './NodeDetailDrawer';
import { Breadcrumbs } from './Breadcrumbs';
import { useWorkflowStore } from '@/stores/workflowStore';
import { updateNodeModel } from '@/lib/api';
import type { WorkflowNode, NodeStatus } from '@/types/workflow';

const nodeTypes: NodeTypes = { task: TaskNodeCard };

const ACCENT_BY_AI: Record<string, TaskNodeData['accent']> = {
  claude: 'warning',
  gpt: 'success',
  gemini: 'sky',
  grok: 'violet',
};

function mapStatus(s: NodeStatus): TaskNodeStatus {
  if (s === 'running') return 'running';
  if (s === 'complete') return 'complete';
  return 'queued';
}

function buildFlowNodes(
  nodes: WorkflowNode[],
  onModelChange: (nodeId: string, model: string) => void,
): TaskNode[] {
  return nodes
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((n, idx) => ({
      id: n.node_id,
      type: 'task' as const,
      position: { x: 40 + idx * 280, y: 120 + (idx % 2) * 160 },
      data: {
        nodeId: n.node_id,
        title: n.title || n.title_zh,
        summary: n.description || n.description_zh,
        agents: 1,
        status: mapStatus(n.status),
        accent: ACCENT_BY_AI[n.assigned_ai] ?? 'brand',
        assignedAi: n.assigned_ai,
        onModelChange,
      },
    }));
}

function buildFlowEdges(nodes: WorkflowNode[]): Edge[] {
  const sorted = nodes.slice().sort((a, b) => a.order - b.order);
  const edges: Edge[] = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    edges.push({
      id: `e-${sorted[i].node_id}-${sorted[i + 1].node_id}`,
      source: sorted[i].node_id,
      target: sorted[i + 1].node_id,
      type: 'smoothstep',
    });
  }
  return edges;
}

export function WorkflowCanvas() {
  const { workflow, workflowId, swapNodeModel } = useWorkflowStore();

  const onModelChange = useCallback(
    (nodeId: string, model: string) => {
      swapNodeModel(nodeId, model);
      if (workflowId) {
        updateNodeModel(workflowId, nodeId, model).catch((err) => {
          console.error('[workflow] updateNodeModel failed', err);
        });
      }
    },
    [swapNodeModel, workflowId],
  );

  const initialNodes = useMemo(
    () => (workflow ? buildFlowNodes(workflow.nodes, onModelChange) : []),
    [workflow, onModelChange],
  );
  const initialEdges = useMemo(
    () => (workflow ? buildFlowEdges(workflow.nodes) : []),
    [workflow],
  );

  const [nodes, setNodes] = useState<TaskNode[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Rebuild when workflow changes OR assignedAi changes on any node
  const workflowSig = useMemo(
    () =>
      workflow?.nodes
        .map((n) => `${n.node_id}:${n.assigned_ai}:${n.status}`)
        .join('|') ?? '',
    [workflow],
  );

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowSig]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds) as typeof nds),
    [],
  );
  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );
  const onConnect = useCallback(
    (conn: Connection) =>
      setEdges((eds) => addEdge({ ...conn, type: 'smoothstep' }, eds)),
    [],
  );

  const selectedNode = useMemo(
    () => workflow?.nodes.find((n) => n.node_id === selectedNodeId) ?? null,
    [workflow, selectedNodeId],
  );

  const crumbs = useMemo(() => {
    const title = workflow?.title_zh || workflow?.title || 'New Workflow';
    const base = [{ label: 'Workflows', href: '/workflows' }, { label: title }];
    if (!selectedNode) return base;
    const nodeLabel = selectedNode.title || selectedNode.title_zh || 'Node';
    return [...base, { label: nodeLabel }];
  }, [selectedNode, workflow]);

  return (
    <div className="relative h-full w-full">
      {/* Top bar */}
      <div className="flex h-[60px] items-center justify-between border-b border-hairline bg-glass px-6">
        <Breadcrumbs items={crumbs} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-hairline bg-surface px-3.5 text-[12.5px] font-medium text-ink-soft shadow-card transition-all hover:border-brand-400 hover:text-ink focus-ring"
          >
            Import Link
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-b from-[#1f1a15] to-[#120e0a] px-3.5 text-[12.5px] font-semibold text-white shadow-[0_2px_8px_-3px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:scale-[1.02] active:scale-[0.98] focus-ring"
          >
            Save Draft
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative h-[calc(100%-60px)] w-full bg-canvas-soft">
        {!workflow || workflow.nodes.length === 0 ? (
          <EmptyState />
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_e, n) => setSelectedNodeId(n.id)}
            defaultEdgeOptions={{
              style: { stroke: '#c9bea9', strokeWidth: 1.75 },
              animated: false,
            }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={26}
              size={1.6}
              color="#d9cfbd"
            />
            <Controls
              showInteractive={false}
              className="!overflow-hidden !rounded-xl !border-hairline !bg-surface !shadow-elevated"
            />
          </ReactFlow>
        )}

        <NodeDetailDrawer nodeId={selectedNodeId} onClose={() => setSelectedNodeId(null)} />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="grid h-full w-full place-items-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="relative grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-brand-100 to-brand-300 text-brand-700 shadow-elevated ring-1 ring-white/50">
          <WorkflowIcon className="h-7 w-7" strokeWidth={1.6} />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl"
            style={{ background: 'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.5), transparent 55%)' }}
          />
        </span>
        <div>
          <p className="text-[16px] font-semibold tracking-tight text-ink">尚未生成工作流</p>
          <p className="mt-1.5 max-w-[380px] text-[12.5px] leading-[1.6] text-ink-muted">
            前往 <span className="font-semibold text-ink">Orchestra</span> 与 AI 对话并确认计划，
            工作流生成后将自动出现在这里。你也可以随时切换每个节点的 AI 模型。
          </p>
        </div>
      </div>
    </div>
  );
}
