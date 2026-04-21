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
import { NodeDetailDrawer, type NodeDetail } from './NodeDetailDrawer';
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

const MODEL_LABEL: Record<string, string> = {
  claude: 'Claude-4.6',
  gpt: 'GPT-4o',
  gemini: 'Gemini',
  grok: 'Grok',
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
  const [selected, setSelected] = useState<NodeDetail | null>(null);

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

  const crumbs = useMemo(() => {
    const title = workflow?.title_zh || workflow?.title || 'New Workflow';
    const base = [{ label: 'Workflows', href: '/workflows' }, { label: title }];
    return selected ? [...base, { label: selected.title }] : base;
  }, [selected, workflow]);

  return (
    <div className="relative h-full w-full">
      {/* Top bar */}
      <div className="flex h-14 items-center justify-between border-b border-hairline bg-canvas px-6">
        <Breadcrumbs items={crumbs} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-dashed border-hairline bg-surface px-3 text-[12.5px] font-medium text-ink-soft hover:border-brand-300"
          >
            Import Link
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#1c1917] px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#2a2724]"
          >
            Save Draft
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative h-[calc(100%-56px)] w-full bg-canvas-soft">
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
            onNodeClick={(_e, n) => {
              const d = n.data as TaskNodeData;
              setSelected({
                id: n.id,
                title: d.title,
                modelLabel: MODEL_LABEL[d.assignedAi] ?? d.assignedAi,
              });
            }}
            defaultEdgeOptions={{ style: { stroke: '#d6d3d1', strokeWidth: 1.5 } }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={22}
              size={1.5}
              color="#d6d3d1"
            />
            <Controls
              showInteractive={false}
              className="!rounded-[12px] !border-hairline !bg-surface !shadow-[0_4px_20px_-12px_rgba(28,25,23,0.2)]"
            />
          </ReactFlow>
        )}

        <NodeDetailDrawer node={selected} onClose={() => setSelected(null)} />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="grid h-full w-full place-items-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-[16px] bg-brand-50 text-brand-500">
          <WorkflowIcon className="h-7 w-7" strokeWidth={1.6} />
        </span>
        <p className="text-[15px] font-semibold text-ink">尚未生成工作流</p>
        <p className="max-w-[360px] text-[12.5px] leading-[1.55] text-ink-muted">
          前往 <span className="font-semibold text-ink">Orchestra</span> 与 AI 对话并确认计划，
          工作流生成后将自动出现在这里。你也可以随时切换每个节点的 AI 模型。
        </p>
      </div>
    </div>
  );
}
