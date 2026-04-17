'use client';

import { useCallback, useMemo, useState } from 'react';
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
import { TaskNodeCard, type TaskNode, type TaskNodeData } from './TaskNodeCard';
import { NodeDetailDrawer, type NodeDetail } from './NodeDetailDrawer';
import { Breadcrumbs } from './Breadcrumbs';

const nodeTypes: NodeTypes = { task: TaskNodeCard };

const INITIAL_NODES: TaskNode[] = [
  {
    id: 'n1',
    type: 'task',
    position: { x: 40, y: 160 },
    data: {
      title: 'Requirements & Architecture',
      summary: 'Clarify scope, shape the tech stack, and draft the component graph.',
      agents: 2,
      status: 'online',
      accent: 'success',
    },
  },
  {
    id: 'n2',
    type: 'task',
    position: { x: 320, y: 40 },
    data: {
      title: '3D UI/UX Design',
      summary: 'Sketch Figma frames for hero scene, controls, and micro-interactions.',
      agents: 1,
      status: 'online',
      accent: 'brand',
    },
  },
  {
    id: 'n3',
    type: 'task',
    position: { x: 600, y: 40 },
    data: {
      title: 'Frontend Components',
      summary: 'Implement Three.js scene + React glue for the design tokens.',
      agents: 3,
      status: 'queued',
      accent: 'violet',
    },
  },
  {
    id: 'n4',
    type: 'task',
    position: { x: 320, y: 280 },
    data: {
      title: 'Setup Weather API',
      summary: 'Provision API credentials and normalise the forecast schema.',
      agents: 1,
      status: 'online',
      accent: 'sky',
    },
  },
  {
    id: 'n5',
    type: 'task',
    position: { x: 600, y: 280 },
    data: {
      title: 'Backend Integration',
      summary: 'Wire Next.js route handlers to the weather provider with caching.',
      agents: 2,
      status: 'queued',
      accent: 'warning',
    },
  },
];

const INITIAL_EDGES: Edge[] = [
  { id: 'e1-2', source: 'n1', target: 'n2', type: 'smoothstep', animated: true },
  { id: 'e1-4', source: 'n1', target: 'n4', type: 'smoothstep', animated: true },
  { id: 'e2-3', source: 'n2', target: 'n3', type: 'smoothstep' },
  { id: 'e4-5', source: 'n4', target: 'n5', type: 'smoothstep' },
];

export function WorkflowCanvas() {
  const [nodes, setNodes] = useState(INITIAL_NODES);
  const [edges, setEdges] = useState(INITIAL_EDGES);
  const [selected, setSelected] = useState<NodeDetail | null>(null);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds) as typeof nds),
    []
  );
  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );
  const onConnect = useCallback(
    (conn: Connection) =>
      setEdges((eds) => addEdge({ ...conn, type: 'smoothstep', animated: true }, eds)),
    []
  );

  const crumbs = useMemo(() => {
    const base = [{ label: 'Workflows', href: '/workflows' }, { label: 'Weather App Workflow' }];
    return selected ? [...base, { label: selected.title }] : base;
  }, [selected]);

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
            setSelected({ id: n.id, title: d.title, modelLabel: 'GPT 5.0' });
          }}
          defaultEdgeOptions={{
            style: { stroke: '#d6d3d1', strokeWidth: 1.5 },
          }}
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

        <NodeDetailDrawer node={selected} onClose={() => setSelected(null)} />
      </div>
    </div>
  );
}
