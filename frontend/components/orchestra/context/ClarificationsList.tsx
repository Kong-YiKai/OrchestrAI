'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import type { ContextPanelNav } from '../ContextPanel';
import { DetailHeader } from './DetailHeader';
import { useOrchestraStore } from '@/stores/orchestraStore';
import type { ClarificationQuestion } from '@/stores/orchestraStore';
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

function QuestionCard({
  q,
  onSubmit,
}: {
  q: ClarificationQuestion;
  onSubmit: (answer: string) => void;
}) {
  const [draft, setDraft] = useState(q.answer ?? '');
  const answered = q.status === 'answered';

  const submit = () => {
    const text = draft.trim();
    if (!text || answered) return;
    onSubmit(text);
  };

  return (
    <div className="flex flex-col gap-2 rounded-[14px] border border-hairline bg-surface p-4">
      <p className="text-[13.5px] font-semibold text-ink">{q.question}</p>
      {q.hint && <p className="text-[11.5px] text-ink-soft">{q.hint}</p>}

      {answered ? (
        <div className="flex items-start gap-2 rounded-[10px] bg-success-100/60 px-3 py-2">
          <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-success-500" />
          <p className="text-[12px] text-success-700">{q.answer}</p>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-[10px] border border-hairline bg-canvas-soft px-3 py-1.5 focus-within:ring-2 focus-within:ring-brand-500/40">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="输入你的回答…"
            className="flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-muted focus:outline-none"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim()}
            className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-brand-500 text-white transition-transform active:scale-95 disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
      )}

      <span className={`self-start rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        answered ? 'bg-success-100 text-success-600' : 'bg-warning-50 text-warning-500'
      }`}>
        {answered ? '已回答' : '待回答'}
      </span>
    </div>
  );
}

export function ClarificationsList({ nav }: { nav: ContextPanelNav }) {
  const { clarificationQuestions, plan, convState, sessionId, setClarifications } = useOrchestraStore();

  const handleAnswer = (q: ClarificationQuestion, answer: string) => {
    // Mark answered locally immediately for responsive UI
    const updated = clarificationQuestions.map((item) =>
      item.id === q.id ? { ...item, answer, status: 'answered' as const } : item
    );
    setClarifications(updated);

    // Send answer via chat so backend clarifier receives it in conversation history
    const socket = getSocket();
    socket.emit('chat_send', {
      content: `${q.question}\n我的回答：${answer}`,
      session_id: sessionId,
    });
  };

  const handleSkip = () => {
    const socket = getSocket();
    socket.emit('chat_send', {
      content: '跳过问题，请根据我的需求和现有信息直接给出工作流计划。',
      session_id: sessionId,
    });
  };

  const handleConfirm = () => {
    const socket = getSocket();
    socket.emit('chat_confirm_start', { session_id: sessionId });
  };

  // View B — plan confirmation
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

  // View A — clarification questions
  return (
    <>
      <DetailHeader title="Clarifications" onBack={() => nav.goBack({ name: 'overview' })} />
      <div className="flex flex-col gap-3 px-5 py-5">
        {clarificationQuestions.length === 0 ? (
          <p className="text-[12.5px] text-ink-muted">等待澄清问题…</p>
        ) : (
          <>
            <p className="text-[12.5px] leading-[1.55] text-ink-muted">
              回答以下问题，AI 将生成更精准的工作流。也可以直接跳过，交给 AI 自行决定。
            </p>

            {clarificationQuestions.map((q) => (
              <QuestionCard
                key={q.id}
                q={q}
                onSubmit={(answer) => handleAnswer(q, answer)}
              />
            ))}

            <button
              type="button"
              onClick={handleSkip}
              className="mt-1 w-full rounded-[12px] border border-hairline bg-surface px-4 py-2.5 text-[13px] font-medium text-ink-soft transition-colors hover:bg-canvas-soft active:scale-[0.98]"
            >
              跳过，交给 AI 决定
            </button>
          </>
        )}
      </div>
    </>
  );
}
