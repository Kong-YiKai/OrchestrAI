'use client';
import { useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { WorkflowNode } from '@/types/workflow';

const STATUS_COLORS: Record<string, string> = {
  idle: '#374151',
  running: '#1d4ed8',
  complete: '#065f46',
  error: '#7f1d1d',
};

const STATUS_BORDER: Record<string, string> = {
  idle: '#4b5563',
  running: '#3b82f6',
  complete: '#10b981',
  error: '#ef4444',
};

function WorkflowFlowNode({ data }: { data: WorkflowNode }) {
  return (
    <div
      className="rounded-xl px-4 py-3 min-w-[160px] max-w-[200px] border-2"
      style={{
        backgroundColor: STATUS_COLORS[data.status] || '#1f2937',
        borderColor: STATUS_BORDER[data.status] || '#374151',
      }}
    >
      <div className="text-xs text-gray-400 mb-1">Step {data.order}</div>
      <div className="text-sm font-semibold text-white leading-tight">{data.title}</div>
      <div className="text-xs text-gray-400 mt-1 truncate">{data.assigned_tool}</div>
      {data.status === 'running' && (
        <div className="mt-2 flex items-center gap-1.5">
          <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-blue-400">Running...</span>
        </div>
      )}
      {data.status === 'complete' && (
        <div className="mt-1 text-xs text-green-400">✓ Done</div>
      )}
      {data.status === 'error' && (
        <div className="mt-1 text-xs text-red-400">✗ Error</div>
      )}
    </div>
  );
}

const nodeTypes = { workflowNode: WorkflowFlowNode };

interface GraphViewProps {
  nodes: WorkflowNode[];
}

export function GraphView({ nodes }: GraphViewProps) {
  const toFlowNodes = useCallback(
    (wfNodes: WorkflowNode[]): Node[] =>
      wfNodes.map((n, i) => ({
        id: n.node_id,
        type: 'workflowNode',
        position: { x: 100 + (i % 3) * 240, y: 60 + Math.floor(i / 3) * 160 },
        data: n as unknown as Record<string, unknown>,
      })),
    []
  );

  const toFlowEdges = useCallback(
    (wfNodes: WorkflowNode[]): Edge[] =>
      wfNodes.slice(0, -1).map((n, i) => ({
        id: `e-${n.node_id}-${wfNodes[i + 1].node_id}`,
        source: n.node_id,
        target: wfNodes[i + 1].node_id,
        animated: wfNodes[i + 1].status === 'running',
        style: { stroke: '#4b5563' },
      })),
    []
  );

  const sorted = [...nodes].sort((a, b) => a.order - b.order);
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(toFlowNodes(sorted));
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(toFlowEdges(sorted));

  useEffect(() => {
    setFlowNodes(toFlowNodes(sorted));
    setFlowEdges(toFlowEdges(sorted));
  }, [nodes]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        colorMode="dark"
      >
        <Background variant={BackgroundVariant.Dots} color="#374151" gap={20} size={1} />
        <Controls className="!bg-gray-900 !border-gray-700" />
      </ReactFlow>
    </div>
  );
}
