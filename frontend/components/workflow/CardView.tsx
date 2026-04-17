'use client';
import { useWorkflowStore } from '@/stores/workflowStore';
import { NodeCard } from './NodeCard';
import { updateNodeModel, retryNode } from '@/lib/api';

interface CardViewProps {
  sessionId: string;
  onExpand: (nodeId: string) => void;
}

export function CardView({ sessionId, onExpand }: CardViewProps) {
  const { workflow, newNodeIds, isExecuting, swapNodeModel, workflowId } = useWorkflowStore();

  if (!workflow || workflow.nodes.length === 0) return null;

  const sorted = [...workflow.nodes].sort((a, b) => a.order - b.order);

  const handleModelSwap = async (nodeId: string, model: string) => {
    swapNodeModel(nodeId, model);
    if (workflowId) {
      await updateNodeModel(workflowId, nodeId, model);
    }
  };

  const handleRetry = async (nodeId: string) => {
    await retryNode(nodeId, sessionId);
  };

  return (
    <div className="flex flex-col gap-3 pb-4">
      {sorted.map((node) => (
        <NodeCard
          key={node.node_id}
          node={node}
          isNew={newNodeIds.includes(node.node_id)}
          onModelSwap={handleModelSwap}
          onRetry={handleRetry}
          onExpand={onExpand}
          isExecuting={isExecuting}
        />
      ))}
    </div>
  );
}
