'use client';

import type { ContextPanelNav } from '../ContextPanel';
import { DetailHeader } from './DetailHeader';
import { useOrchestraStore } from '@/stores/orchestraStore';
import { getSocket } from '@/lib/socket';

// Stub exports for Phase 5 (ClarificationDetail still imports these)
export type ClarificationAgent = {
  id: string;
  name: string;
  role: string;
  tone: 'green' | 'orange';
  task: string;
  pending: number;
};
export const CLARIFICATION_AGENTS: ClarificationAgent[] = [];

export function ClarificationsList({ nav }: { nav: ContextPanelNav }) {
  const { clarificationQuestions, plan, convState, sessionId } = useOrchestraStore();

  const handleConfirm = () => {
    const socket = getSocket();
    socket.emit('chat_confirm_start', { session_id: sessionId });
  };

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

  return (
    <>
      <DetailHeader title="Clarifications" onBack={() => nav.goBack({ name: 'overview' })} />
      <div className="flex flex-col gap-3 px-5 py-5">
        {clarificationQuestions.length === 0 ? (
          <p className="text-[12.5px] text-ink-muted">等待澄清问题…</p>
        ) : (
          <>
            <p className="text-[12.5px] leading-[1.55] text-ink-muted">
              请在对话框中回答以下问题，以便生成更精准的工作流。
            </p>
            {clarificationQuestions.map((q) => (
              <div
                key={q.id}
                className="flex flex-col gap-1.5 rounded-[14px] border border-hairline bg-surface p-4"
              >
                <p className="text-[13.5px] font-semibold text-ink">{q.question}</p>
                {q.hint && (
                  <p className="text-[11.5px] text-ink-soft">{q.hint}</p>
                )}
                <span
                  className={`self-start rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    q.status === 'answered'
                      ? 'bg-success-100 text-success-600'
                      : 'bg-warning-50 text-warning-500'
                  }`}
                >
                  {q.status === 'answered' ? '已回答' : '待回答'}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}
