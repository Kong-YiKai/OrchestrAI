'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useWorkflowStore } from '@/stores/workflowStore';
import { CardView } from './CardView';
import { GraphView } from './GraphView';
import { NodeResultDrawer } from './NodeResultDrawer';
import { runWorkflow } from '@/lib/api';

interface WorkflowPanelProps {
  sessionId: string;
}

export function WorkflowPanel({ sessionId }: WorkflowPanelProps) {
  const { workflow, viewMode, isExecuting, setViewMode, setExecuting, workflowId } =
    useWorkflowStore();
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);

  const handleExecute = async () => {
    if (!workflowId || isExecuting) return;
    setExecuting(true);
    await runWorkflow(workflowId, sessionId);
  };

  const hasNodes = workflow && workflow.nodes.length > 0;

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <div className="flex-1 min-w-0">
          {workflow ? (
            <>
              <p className="text-sm font-semibold text-white truncate">
                {workflow.title_zh || workflow.title}
              </p>
              <p className="text-xs text-gray-500">
                {workflow.nodes.length} steps
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-400">Workflow Canvas</p>
              <p className="text-xs text-gray-600">Your workflow will appear here</p>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {hasNodes && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs border-gray-700 text-gray-300 hover:bg-gray-800"
              onClick={() => setViewMode(viewMode === 'cards' ? 'graph' : 'cards')}
            >
              {viewMode === 'cards' ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1">
                    <circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/>
                    <path d="M9 6h6M6 9v6M18 9v6M9 18h6"/>
                  </svg>
                  Node Graph
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1">
                    <rect x="3" y="3" width="18" height="5" rx="1"/><rect x="3" y="10" width="18" height="5" rx="1"/><rect x="3" y="17" width="18" height="5" rx="1"/>
                  </svg>
                  Card View
                </>
              )}
            </Button>
          )}

          {hasNodes && (
            <Button
              size="sm"
              className="h-7 text-xs bg-blue-600 hover:bg-blue-500 text-white"
              onClick={handleExecute}
              disabled={isExecuting || !workflowId}
            >
              {isExecuting ? (
                <>
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
                  Running...
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="mr-1">
                    <polygon points="5,3 19,12 5,21"/>
                  </svg>
                  Execute
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 relative">
        {!hasNodes ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="text-5xl mb-4 opacity-30">⚙️</div>
            <p className="text-gray-500 text-sm">No workflow yet</p>
            <p className="text-gray-700 text-xs mt-1">
              Type your idea in the chat to auto-generate a workflow
            </p>
          </div>
        ) : viewMode === 'cards' ? (
          <ScrollArea className="h-full px-4 py-3">
            <CardView sessionId={sessionId} onExpand={setExpandedNodeId} />
          </ScrollArea>
        ) : (
          <div className="h-full">
            <GraphView nodes={workflow!.nodes} />
          </div>
        )}
      </div>

      {/* Node result drawer — only mount when a node is selected */}
      {expandedNodeId && (
        <NodeResultDrawer
          nodeId={expandedNodeId}
          onClose={() => setExpandedNodeId(null)}
        />
      )}
    </div>
  );
}
