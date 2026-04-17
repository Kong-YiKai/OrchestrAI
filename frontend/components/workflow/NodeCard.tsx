'use client';
import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AIModelSelector } from './AIModelSelector';
import type { WorkflowNode } from '@/types/workflow';
import { useWorkflowStore } from '@/stores/workflowStore';

const TOOL_TYPE_COLORS: Record<string, string> = {
  api: '#10B981',
  web_automation: '#F59E0B',
  llm: '#3B82F6',
  code: '#8B5CF6',
};

const TOOL_TYPE_LABELS: Record<string, string> = {
  api: 'API',
  web_automation: 'Browser',
  llm: 'LLM',
  code: 'Code',
};

const METHOD_LABELS: Record<string, string> = {
  api: '⚡ Direct API',
  playwright: '🌐 Browser Auto',
  simulated: '🤖 AI Simulated',
};

const EMPTY_LOGS: string[] = [];

interface NodeCardProps {
  node: WorkflowNode;
  isNew: boolean;
  onModelSwap: (nodeId: string, model: string) => void;
  onRetry: (nodeId: string) => void;
  onExpand: (nodeId: string) => void;
  isExecuting: boolean;
}

export function NodeCard({ node, isNew, onModelSwap, onRetry, onExpand, isExecuting }: NodeCardProps) {
  const nodeLogs = useWorkflowStore((s) => s.nodeLogs[node.node_id] ?? EMPTY_LOGS);
  const logsRef = useRef<HTMLDivElement>(null);
  const { markNodeOld } = useWorkflowStore();

  useEffect(() => {
    if (isNew) {
      const t = setTimeout(() => markNodeOld(node.node_id), 1000);
      return () => clearTimeout(t);
    }
  }, [isNew, node.node_id, markNodeOld]);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [nodeLogs]);

  const borderColor =
    node.status === 'running' ? '#3B82F6' :
    node.status === 'complete' ? '#10B981' :
    node.status === 'error' ? '#EF4444' :
    '#374151';

  return (
    <motion.div
      initial={isNew ? { opacity: 0, y: 24 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="rounded-xl border-2 bg-gray-900 p-4 flex flex-col gap-2.5 relative"
      style={{
        borderColor,
        boxShadow: node.status === 'running' ? `0 0 12px ${borderColor}40` : undefined,
      }}
    >
      {/* Step badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
            style={{ backgroundColor: borderColor + 'cc' }}
          >
            Step {node.order}
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded font-medium"
            style={{
              backgroundColor: (TOOL_TYPE_COLORS[node.tool_type] || '#6b7280') + '22',
              color: TOOL_TYPE_COLORS[node.tool_type] || '#9ca3af',
            }}
          >
            {TOOL_TYPE_LABELS[node.tool_type] || node.tool_type}
          </span>
        </div>
        {node.status === 'running' && (
          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
        )}
        {node.status === 'complete' && (
          <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}
        {node.status === 'error' && (
          <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M3 3l6 6M9 3l-6 6" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
        )}
      </div>

      {/* Title */}
      <div>
        <h3 className="text-sm font-semibold text-white leading-snug">{node.title}</h3>
        <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{node.description}</p>
      </div>

      {/* Tool + AI row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-gray-500 text-xs flex-shrink-0">Tool:</span>
          <span className="text-xs text-gray-300 truncate">{node.assigned_tool || '—'}</span>
        </div>
        <AIModelSelector
          value={node.assigned_ai}
          onChange={(m) => onModelSwap(node.node_id, m)}
          disabled={isExecuting}
        />
      </div>

      {/* Running: live logs */}
      {node.status === 'running' && nodeLogs.length > 0 && (
        <div
          ref={logsRef}
          className="bg-gray-950 rounded-lg p-2 max-h-20 overflow-y-auto"
        >
          {nodeLogs.map((line, i) => (
            <p key={i} className="text-xs text-gray-400 font-mono leading-5">
              {line}
            </p>
          ))}
        </div>
      )}

      {/* Complete: result summary */}
      {node.status === 'complete' && node.result && (
        <div className="bg-gray-950 rounded-lg p-2.5 border border-green-900/40">
          <p className="text-xs text-green-300 leading-relaxed">{node.result.summary}</p>
          {node.execution_method && (
            <span className="text-xs text-gray-600 mt-1 block">
              {METHOD_LABELS[node.execution_method] || node.execution_method}
            </span>
          )}
          <button
            onClick={() => onExpand(node.node_id)}
            className="text-xs text-blue-400 hover:text-blue-300 mt-1 block"
          >
            View details →
          </button>
        </div>
      )}

      {/* Error */}
      {node.status === 'error' && (
        <div className="bg-red-950/30 rounded-lg p-2.5 border border-red-900/40">
          <p className="text-xs text-red-300">{node.error || 'Execution failed'}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2 h-6 text-xs border-red-800 text-red-300 hover:bg-red-900/30"
            onClick={() => onRetry(node.node_id)}
          >
            Retry
          </Button>
        </div>
      )}
    </motion.div>
  );
}
