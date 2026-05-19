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
import { Loader2, Play, Workflow as WorkflowIcon } from 'lucide-react';
import { TaskNodeCard, type TaskNode, type TaskNodeData, type TaskNodeStatus } from './TaskNodeCard';
import { NodeDetailDrawer } from './NodeDetailDrawer';
import { Breadcrumbs } from './Breadcrumbs';
import { useWorkflowStore } from '@/stores/workflowStore';
import { runNode, runWorkflow, stopNode, updateNodeModel } from '@/lib/api';
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
  onNodeRun: (nodeId: string) => void,
  onNodeStop: (nodeId: string) => void,
): TaskNode[] {
  const sorted = nodes.slice().sort((a, b) => a.order - b.order);
  const levels = computeNodeLevels(sorted);
  const levelRows = new Map<number, number>();

  return nodes
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((n) => {
      const level = levels.get(n.node_id) ?? 0;
      const row = levelRows.get(level) ?? 0;
      levelRows.set(level, row + 1);
      const parentOffset = n.parent_node_id ? 60 : 0;
      return {
        id: n.node_id,
        type: 'task' as const,
        position: { x: 40 + level * 320, y: 100 + row * 190 + parentOffset },
        data: {
          nodeId: n.node_id,
          title: n.title || n.title_zh,
          summary: n.description || n.description_zh,
          agents: 1,
          status: mapStatus(n.status),
          accent: ACCENT_BY_AI[n.assigned_ai] ?? 'brand',
          assignedAi: n.assigned_ai,
          nodeType: n.node_type ?? 'task',
          parallelGroup: n.parallel_group,
          onModelChange,
          onRun: onNodeRun,
          onStop: onNodeStop,
        },
      };
    });
}

function buildFlowEdges(nodes: WorkflowNode[]): Edge[] {
  const sorted = nodes.slice().sort((a, b) => a.order - b.order);
  const hasExplicitDependencies = sorted.some((node) => node.depends_on?.length > 0);
  if (hasExplicitDependencies) {
    return sorted.flatMap((node) =>
      (node.depends_on ?? []).map((source) => ({
        id: `e-${source}-${node.node_id}`,
        source,
        target: node.node_id,
        type: 'smoothstep',
        animated: Boolean(node.parallel_group),
      })),
    );
  }

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

function computeNodeLevels(nodes: WorkflowNode[]): Map<string, number> {
  const byId = new Map(nodes.map((node) => [node.node_id, node]));
  const memo = new Map<string, number>();

  const visit = (node: WorkflowNode, seen: Set<string>): number => {
    if (memo.has(node.node_id)) return memo.get(node.node_id) ?? 0;
    if (seen.has(node.node_id)) return 0;
    const deps = (node.depends_on ?? []).filter((id) => byId.has(id));
    if (deps.length === 0) {
      memo.set(node.node_id, 0);
      return 0;
    }
    const nextSeen = new Set(seen);
    nextSeen.add(node.node_id);
    const level = Math.max(...deps.map((id) => visit(byId.get(id)!, nextSeen))) + 1;
    memo.set(node.node_id, level);
    return level;
  };

  for (const node of nodes) visit(node, new Set());
  return memo;
}

export function WorkflowCanvas() {
  const workflow = useWorkflowStore((s) => s.workflow);
  const workflowId = useWorkflowStore((s) => s.workflowId);
  const isExecuting = useWorkflowStore((s) => s.isExecuting);
  const swapNodeModel = useWorkflowStore((s) => s.swapNodeModel);
  const setExecuting = useWorkflowStore((s) => s.setExecuting);
  const updateNodeStatus = useWorkflowStore((s) => s.updateNodeStatus);

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

  const onRun = useCallback(async () => {
    if (!workflowId || !workflow || isExecuting) return;
    // Flip every node back to queued so a re-run visibly animates from the
    // start instead of leaving prior state on the cards.
    for (const n of workflow.nodes) updateNodeStatus(n.node_id, 'idle');
    setExecuting(true);

    const sessionId =
      typeof window !== 'undefined'
        ? localStorage.getItem('orchestrai_session') || 'default'
        : 'default';
    try {
      // Mock mode: staged events with artificial delays — works without any
      // external API keys, matches the Run button's role as a demo trigger.
      await runWorkflow(workflowId, sessionId);
    } catch (err) {
      console.error('[workflow] runWorkflow failed', err);
      setExecuting(false);
    }
  }, [workflow, workflowId, isExecuting, setExecuting, updateNodeStatus]);

  const getSessionId = useCallback(
    () =>
      typeof window !== 'undefined'
        ? localStorage.getItem('orchestrai_session') || 'default'
        : 'default',
    [],
  );

  const onNodeRun = useCallback(
    async (nodeId: string) => {
      updateNodeStatus(nodeId, 'idle');
      try {
        await runNode(nodeId, getSessionId());
      } catch (err) {
        console.error('[workflow] runNode failed', err);
      }
    },
    [getSessionId, updateNodeStatus],
  );

  const onNodeStop = useCallback(
    async (nodeId: string) => {
      try {
        await stopNode(nodeId, getSessionId());
      } catch (err) {
        console.error('[workflow] stopNode failed', err);
      }
    },
    [getSessionId],
  );

  const initialNodes = useMemo(
    () => (workflow ? buildFlowNodes(workflow.nodes, onModelChange, onNodeRun, onNodeStop) : []),
    [workflow, onModelChange, onNodeRun, onNodeStop],
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
        .map((n) => `${n.node_id}:${n.assigned_ai}:${n.status}:${n.title}:${n.title_zh}:${n.description}:${n.description_zh}:${n.assigned_tool}:${n.tool_type}:${n.node_type}:${n.parent_node_id}:${n.parallel_group}:${(n.depends_on ?? []).join(',')}`)
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
            Save Draft
          </button>
          <button
            type="button"
            onClick={onRun}
            disabled={!workflowId || isExecuting}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-b from-[#1f1a15] to-[#120e0a] px-3.5 text-[12.5px] font-semibold text-white shadow-[0_2px_8px_-3px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:scale-[1.02] active:scale-[0.98] focus-ring disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
          >
            {isExecuting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                Running…
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-white" strokeWidth={2} />
                Run
              </>
            )}
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
