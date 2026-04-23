'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContextPanelNav } from '../ContextPanel';
import { DetailHeader } from './DetailHeader';
import { useOrchestraStore } from '@/stores/orchestraStore';
import { useWorkflowStore } from '@/stores/workflowStore';
import type { WorkflowNode } from '@/types/workflow';

// Stub kept for backward compat imports elsewhere (Phase 5)
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

const AI_TONE: Record<string, { card: string; avatar: string; badge: string }> = {
  claude: {
    card: 'border-[#fde68a] bg-warning-50/25',
    avatar: 'bg-[#c2410c]',
    badge: 'bg-warning-50 text-warning-500',
  },
  gpt: {
    card: 'border-[#8cc7a8] bg-[#f4faf6]',
    avatar: 'bg-[#2f855a]',
    badge: 'bg-success-100 text-success-700',
  },
  gemini: {
    card: 'border-[#bde0fe] bg-[#f1f7ff]',
    avatar: 'bg-[#1d4ed8]',
    badge: 'bg-sky-100 text-sky-700',
  },
  grok: {
    card: 'border-[#e9d5ff] bg-[#faf5ff]',
    avatar: 'bg-[#6d28d9]',
    badge: 'bg-violet-100 text-violet-700',
  },
};

const AI_LABEL: Record<string, string> = {
  claude: 'Claude-4.6',
  gpt: 'GPT-4o',
  gemini: 'Gemini',
  grok: 'Grok',
};

function toneFor(ai: string) {
  return AI_TONE[ai] ?? AI_TONE.claude;
}

export function BuildingProcessList({ nav }: { nav: ContextPanelNav }) {
  const router = useRouter();
  const { buildingLogs, isBuildingComplete, readyWorkflowId } = useOrchestraStore();
  const { workflow } = useWorkflowStore();

  const progress = isBuildingComplete
    ? 100
    : Math.min(Math.round((buildingLogs.length / EXPECTED_LOGS) * 100), 90);

  const nodes = workflow?.nodes ?? [];
  const showOpenCanvasCta = isBuildingComplete && Boolean(readyWorkflowId);

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

        {/* Open Canvas CTA — shown once building is complete */}
        {showOpenCanvasCta && readyWorkflowId && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => router.push(`/workflows/${readyWorkflowId}`)}
            className="group relative inline-flex h-11 w-full items-center justify-between overflow-hidden rounded-xl bg-gradient-to-b from-brand-500 to-brand-600 px-4 text-[13px] font-semibold text-white shadow-brand-glow transition-transform hover:scale-[1.01] active:scale-[0.99] focus-ring"
          >
            <span className="relative z-10 flex items-center gap-2">
              <span aria-hidden>✨</span>
              打开画布 · Open Canvas
            </span>
            <ArrowRight className="relative z-10 h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
            />
          </motion.button>
        )}

        {/* Agent node cards (shown after workflow is ready) */}
        {nodes.length > 0 ? (
          <>
            <p className="text-[12.5px] leading-[1.55] text-ink-muted">
              These agents are executing tasks in parallel. Some require your approval to proceed.
            </p>
            <div className="flex flex-col gap-3">
              {nodes.map((n) => (
                <NodeAgentCard
                  key={n.node_id}
                  node={n}
                  onClick={() => nav.goTo({ name: 'building-agent', agentId: n.node_id })}
                />
              ))}
            </div>
          </>
        ) : (
          /* Logs during generation */
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
        )}
      </div>
    </>
  );
}

function NodeAgentCard({ node, onClick }: { node: WorkflowNode; onClick: () => void }) {
  const tone = toneFor(node.assigned_ai);
  const label = AI_LABEL[node.assigned_ai] ?? node.assigned_ai;
  const progressPct = 0; // Phase 3: execution not wired yet

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full flex-col gap-3 rounded-[16px] border p-4 text-left transition-shadow',
        tone.card,
        'hover:shadow-[0_4px_20px_-12px_rgba(28,25,23,0.15)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'grid h-11 w-11 flex-shrink-0 place-items-center rounded-[12px] text-[14px] font-semibold text-white',
            tone.avatar,
          )}
        >
          {label.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[14.5px] font-semibold text-ink">{label}</p>
            <span className={cn('rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold', tone.badge)}>
              Pending
            </span>
          </div>
          <p className="mt-0.5 truncate text-[12.5px] text-ink-muted">{node.title}</p>
        </div>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-muted" strokeWidth={1.8} />
      </div>
      <div>
        <div className="flex items-center justify-between text-[11.5px] text-ink-muted">
          <span>Progress</span>
          <span className="font-semibold text-ink-soft">{progressPct}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-canvas-soft">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="mt-2 flex justify-end">
          <span className="rounded-full bg-warning-50 px-2 py-0.5 text-[11px] font-semibold text-[#d97706]">
            Execution not started
          </span>
        </div>
      </div>
    </button>
  );
}
