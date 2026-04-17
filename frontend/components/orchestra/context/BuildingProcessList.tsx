'use client';

import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContextPanelNav } from '../ContextPanel';
import { DetailHeader } from './DetailHeader';

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

export const BUILDING_AGENTS: BuildingAgent[] = [
  {
    id: 'claude-4-6',
    name: 'Claude-4.6',
    tone: 'orange',
    task: 'Environment & Deployment Config',
    status: 'waiting',
    progress: 40,
    approvals: 2,
    subrole: 'Env Configurator',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    tone: 'teal',
    task: 'Component Architecture & UI',
    status: 'running',
    progress: 65,
    approvals: 1,
    subrole: 'Component Engineer',
  },
];

const TONE = {
  orange: { card: 'border-[#fde68a] bg-warning-50/30', avatar: 'bg-[#c2410c]' },
  teal: { card: 'border-[#99d6cc] bg-[#f0faf7]', avatar: 'bg-[#0f766e]' },
} as const;

export function BuildingProcessList({ nav }: { nav: ContextPanelNav }) {
  return (
    <>
      <DetailHeader title="Building Process" onBack={() => nav.goBack({ name: 'overview' })} />
      <div className="px-5 py-5">
        <p className="mb-4 text-[12.5px] leading-[1.55] text-ink-muted">
          These agents are executing tasks in parallel. Some require your approval to proceed.
        </p>
        <div className="flex flex-col gap-3">
          {BUILDING_AGENTS.map((a) => {
            const tone = TONE[a.tone];
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => nav.goTo({ name: 'building-agent', agentId: a.id })}
                className={cn(
                  'flex w-full flex-col gap-3 rounded-[14px] border p-4 text-left transition-shadow hover:shadow-[0_4px_20px_-12px_rgba(28,25,23,0.15)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                  tone.card
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'grid h-11 w-11 flex-shrink-0 place-items-center rounded-[12px] text-[14px] font-semibold text-white',
                      tone.avatar
                    )}
                  >
                    {a.name.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[15px] font-semibold text-ink">{a.name}</p>
                      <StatusChip status={a.status} />
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-ink-muted">{a.task}</p>
                  </div>
                  <ChevronRight
                    className="mt-1.5 h-4 w-4 flex-shrink-0 text-ink-muted"
                    strokeWidth={1.8}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11.5px] text-ink-muted">
                    <span>Progress</span>
                    <span className="font-semibold text-ink-soft">{a.progress}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-canvas-soft">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
                      initial={{ width: 0 }}
                      animate={{ width: `${a.progress}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <span className="inline-flex items-center rounded-full bg-[#fde2ec] px-2.5 py-1 text-[11.5px] font-semibold text-[#e11d74]">
                    {a.approvals} approval needed
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function StatusChip({ status }: { status: 'waiting' | 'running' }) {
  if (status === 'waiting') {
    return (
      <span className="inline-flex items-center rounded-md bg-warning-50 px-2 py-0.5 text-[11px] font-semibold text-[#d97706]">
        Waiting
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-warning-50 px-2 py-0.5 text-[11px] font-semibold text-[#d97706]">
      <span className="h-1.5 w-1.5 rounded-full bg-warning-500 animate-pulse" aria-hidden />
      Running
    </span>
  );
}
