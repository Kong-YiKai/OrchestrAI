'use client';

import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContextPanelNav } from '../ContextPanel';
import { DetailHeader } from './DetailHeader';
import { useOrchestraStore } from '@/stores/orchestraStore';
import { getSocket } from '@/lib/socket';

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
  const {
    clarificationQuestions,
    plan,
    convState,
    sessionId,
  } = useOrchestraStore();

  const handleConfirm = () => {
    const socket = getSocket();
    socket.emit('chat_confirm_start', { session_id: sessionId });
  };

  // View B — plan confirmation (unchanged layout from previous)
  if (convState === 'awaiting_confirm' && plan) {
    return (
      <>
        <DetailHeader title="Clarifications" onBack={() => nav.goBack({ name: 'overview' })} />
        <div className="flex flex-col gap-4 px-5 py-5">
          <div>
            <p className="text-[15px] font-semibold text-ink">{plan.title}</p>
            <p className="mt-1 text-[12.5px] leading-[1.55] text-ink-muted">{plan.summary}</p>
          </div>

          <div className="flex flex-col gap-2">
            {plan.nodes.map((node) => (
              <div
                key={node.order}
                className="flex items-start gap-3 rounded-[12px] border border-hairline bg-surface px-3 py-2.5"
              >
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-500 text-[10px] font-bold text-white">
                  {node.order}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-ink">{node.title}</p>
                  <p className="mt-0.5 text-[11.5px] text-ink-muted">{node.description}</p>
                </div>
                <span className="flex-shrink-0 rounded-md bg-canvas-soft px-2 py-0.5 text-[10px] font-semibold text-ink-soft">
                  {node.recommended_ai}
                </span>
              </div>
            ))}
          </div>

          <p className="text-[12px] text-ink-muted">{plan.confirmation_prompt}</p>

          <button
            type="button"
            onClick={handleConfirm}
            className="mt-1 w-full rounded-[12px] bg-brand-500 px-4 py-2.5 text-[13.5px] font-semibold text-white transition-all hover:bg-brand-600 active:scale-[0.98]"
          >
            开始生成
          </button>
        </div>
      </>
    );
  }

  // View A — agent summary cards (one per clarification agent)
  const pending = clarificationQuestions.filter((q) => !q.confirmed).length;
  const totalQuestions = clarificationQuestions.length;
  const claudeAgent = CLARIFICATION_AGENTS[0];
  const tone = TONE[claudeAgent.tone];

  return (
    <>
      <DetailHeader title="Clarifications" onBack={() => nav.goBack({ name: 'overview' })} />
      <div className="flex flex-col gap-4 px-5 py-5">
        {totalQuestions === 0 ? (
          <p className="text-[12.5px] text-ink-muted">等待澄清问题…</p>
        ) : (
          <>
            <p className="text-[12.5px] leading-[1.55] text-ink-muted">
              AI Agent 需要你的输入才能继续。
            </p>

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
          </>
        )}
      </div>
    </>
  );
}
