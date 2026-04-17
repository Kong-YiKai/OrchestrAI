'use client';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { useWorkflowStore } from '@/stores/workflowStore';

const METHOD_LABELS: Record<string, string> = {
  api: '⚡ Direct API Call',
  playwright: '🌐 Browser Automation (Playwright)',
  simulated: '🤖 AI-Simulated Result',
};

// Stable empty array — never recreated, so Zustand selector stays stable
const EMPTY_LOGS: string[] = [];

interface NodeResultDrawerProps {
  nodeId: string;
  onClose: () => void;
}

export function NodeResultDrawer({ nodeId, onClose }: NodeResultDrawerProps) {
  const workflow = useWorkflowStore((s) => s.workflow);
  // Use stable EMPTY_LOGS constant as fallback to avoid new array on every render
  const nodeLogs = useWorkflowStore((s) => s.nodeLogs[nodeId] ?? EMPTY_LOGS);

  const node = workflow?.nodes.find((n) => n.node_id === nodeId);

  return (
    <Drawer open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DrawerContent className="bg-gray-900 border-gray-700 max-h-[80vh]">
        <DrawerHeader className="border-b border-gray-800">
          <div className="flex items-start justify-between">
            <div>
              <DrawerTitle className="text-white text-base">
                {node?.title || 'Node Result'}
              </DrawerTitle>
              <DrawerDescription className="text-gray-400 text-sm mt-1">
                Step {node?.order} · {node?.assigned_tool}
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white" onClick={onClose}>
                ✕
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="p-4 overflow-y-auto space-y-4">
          {node?.execution_method && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Execution method:</span>
              <span className="text-xs text-gray-300 font-medium">
                {METHOD_LABELS[node.execution_method] || node.execution_method}
              </span>
            </div>
          )}

          {node?.result && (
            <>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">Result Summary</p>
                <p className="text-sm text-green-300 bg-green-950/30 rounded-lg p-3 border border-green-900/30">
                  {node.result.summary}
                </p>
              </div>

              {node.result.summary_zh && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">结果摘要</p>
                  <p className="text-sm text-blue-300 bg-blue-950/30 rounded-lg p-3 border border-blue-900/30">
                    {node.result.summary_zh}
                  </p>
                </div>
              )}

              {Object.keys(node.result.raw).length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">Raw Data</p>
                  <pre className="text-xs text-gray-300 bg-gray-950 rounded-lg p-3 overflow-x-auto border border-gray-800">
                    {JSON.stringify(node.result.raw, null, 2)}
                  </pre>
                </div>
              )}
            </>
          )}

          {nodeLogs.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">Execution Logs</p>
              <div className="bg-gray-950 rounded-lg p-3 border border-gray-800 max-h-48 overflow-y-auto">
                {nodeLogs.map((line, i) => (
                  <p key={i} className="text-xs text-gray-400 font-mono leading-5">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
