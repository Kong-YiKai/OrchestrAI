'use client';

import { motion } from 'framer-motion';
import type { ContextPanelNav } from '../ContextPanel';
import { DetailHeader } from './DetailHeader';
import { useOrchestraStore } from '@/stores/orchestraStore';

// Stub exports for Phase 5 (BuildingAgentDetail still imports these)
export type BuildingAgent = {
  id: string;
  name: string;
  tone: 'orange' | 'teal';
  task: string;
  status: 'waiting' | 'running';
  progress: number;
  approvals: number;
  subrole: string;
};
export const BUILDING_AGENTS: BuildingAgent[] = [];

const LOG_ICONS: Record<string, string> = {
  thinking: '💭',
  analyzing: '🔍',
  generating: '⚙️',
  deciding: '🤔',
  done: '✅',
  error: '❌',
};

const EXPECTED_LOGS = 5;

export function BuildingProcessList({ nav }: { nav: ContextPanelNav }) {
  const { buildingLogs, isBuildingComplete } = useOrchestraStore();

  const progress = isBuildingComplete
    ? 100
    : Math.min(Math.round((buildingLogs.length / EXPECTED_LOGS) * 100), 90);

  return (
    <>
      <DetailHeader title="Building Process" onBack={() => nav.goBack({ name: 'overview' })} />
      <div className="flex flex-col gap-4 px-5 py-5">

        {/* Progress bar */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11.5px] text-ink-muted">
            <span>{isBuildingComplete ? '设计完成 ✓' : '正在生成…'}</span>
            <span className="font-semibold text-ink-soft">{progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas-soft">
            <motion.div
              className={`h-full rounded-full ${isBuildingComplete ? 'bg-success-400' : 'bg-gradient-to-r from-brand-400 to-brand-600'}`}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Log entries */}
        <div className="flex flex-col gap-2">
          {buildingLogs.length === 0 ? (
            <p className="text-[12.5px] text-ink-muted">等待开始…</p>
          ) : (
            buildingLogs.map((log) => (
              <div key={log.log_id} className="flex items-start gap-2.5 text-[12.5px]">
                <span className="mt-0.5 flex-shrink-0 text-[14px]">
                  {LOG_ICONS[log.type] ?? '•'}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-ink">{log.message}</span>
                  <span className="ml-2 text-[10.5px] text-ink-soft">
                    {new Date(log.timestamp).toLocaleTimeString('zh-CN', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </>
  );
}
