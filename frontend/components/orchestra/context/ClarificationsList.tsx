'use client';

import { ChevronRight, PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContextPanelNav } from '../ContextPanel';
import { DetailHeader } from './DetailHeader';
import { useOrchestraStore } from '@/stores/orchestraStore';

export type ClarificationAgent = {
  id: string;
  name: string;
  role: string;
  tone: 'orange' | 'green';
  task: string;
};

export const CLARIFICATION_AGENTS: ClarificationAgent[] = [
  {
    id: 'claude-4-6',
    name: 'Claude-4.6',
    role: 'Architect',
    tone: 'orange',
    task: '需求澄清与方案设计',
  },
];

const TONE = {
  orange: { card: 'border-[#fde68a] bg-warning-50/25', avatar: 'bg-[#c2410c]' },
  green: { card: 'border-[#8cc7a8] bg-[#f4faf6]', avatar: 'bg-[#2f855a]' },
} as const;

export function ClarificationsList({ nav }: { nav: ContextPanelNav }) {
  const clarificationQuestions = useOrchestraStore((s) => s.clarificationQuestions);
  const plan = useOrchestraStore((s) => s.plan);
  const convState = useOrchestraStore((s) => s.convState);

  const pending = clarificationQuestions.filter((q) => !q.confirmed).length;
  const totalQuestions = clarificationQuestions.length;
  const claudeAgent = CLARIFICATION_AGENTS[0];
  const tone = TONE[claudeAgent.tone];

  const planReady = Boolean(plan) && convState === 'awaiting_confirm';
  const planLocked = convState === 'generating' || convState === 'complete';

  return (
    <>
      <DetailHeader title="Clarifications" onBack={() => nav.goBack({ name: 'overview' })} />
      <div className="flex flex-col gap-3 px-5 py-5">
        {totalQuestions === 0 && !planReady && !planLocked ? (
          <p className="text-[12.5px] text-ink-muted">等待澄清问题…</p>
        ) : (
          <p className="text-[12.5px] leading-[1.55] text-ink-muted">
            {planLocked
              ? '工作流已开始生成，澄清窗口已锁定。'
              : planReady
                ? '所有 agent 已澄清完毕，点击下方卡片查看并确认计划。'
                : 'AI Agent 需要你的输入才能继续，点击进入查看待澄清问题。'}
          </p>
        )}

        {/* Agent clarification cards */}
        {totalQuestions > 0 && (
          <button
            type="button"
            onClick={() => nav.goTo({ name: 'clarification-agent', agentId: claudeAgent.id })}
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
                {claudeAgent.name.charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-ink">
                  {claudeAgent.name}{' '}
                  <span className="ml-1 rounded-md bg-canvas-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-soft">
                    {claudeAgent.role}
                  </span>
                </p>
                <p className="mt-0.5 text-[12.5px] text-ink-muted">{claudeAgent.task}</p>
              </div>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-muted" strokeWidth={1.8} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] text-ink-muted">Pending decisions</span>
              {pending > 0 ? (
                <span className="rounded-full bg-[#fde2ec] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#e11d74]">
                  {pending} awaiting
                </span>
              ) : (
                <span className="rounded-full bg-success-100 px-2.5 py-0.5 text-[11.5px] font-semibold text-success-700">
                  全部已确认
                </span>
              )}
            </div>
          </button>
        )}

        {/* "开始生成工作流" card — drill-in to PlanDetail */}
        {(planReady || planLocked) && plan && (
          <button
            type="button"
            onClick={() => nav.goTo({ name: 'plan-detail' })}
            className={cn(
              'flex w-full flex-col gap-3 rounded-[16px] border p-4 text-left transition-shadow',
              planLocked
                ? 'border-success-500/30 bg-success-50/40'
                : 'border-[#cdb4f5] bg-[#f3eefe]',
              'hover:shadow-[0_4px_20px_-12px_rgba(28,25,23,0.15)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
            )}
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'grid h-11 w-11 flex-shrink-0 place-items-center rounded-[12px] text-white',
                  planLocked ? 'bg-success-500' : 'bg-[#7c3aed]',
                )}
              >
                <PlayCircle className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-ink">
                  开始生成工作流
                  <span className="ml-2 rounded-md bg-canvas-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-soft">
                    {plan.nodes.length} 步
                  </span>
                </p>
                <p className="mt-0.5 truncate text-[12.5px] text-ink-muted">{plan.title}</p>
              </div>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-muted" strokeWidth={1.8} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] text-ink-muted">
                {planLocked ? '已确认 · 不可修改' : '点击查看 / 编辑计划'}
              </span>
              {planLocked ? (
                <span className="rounded-full bg-success-100 px-2.5 py-0.5 text-[11.5px] font-semibold text-success-700">
                  已锁定
                </span>
              ) : (
                <span className="rounded-full bg-[#ede9fe] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#6d28d9]">
                  待确认
                </span>
              )}
            </div>
          </button>
        )}
      </div>
    </>
  );
}
