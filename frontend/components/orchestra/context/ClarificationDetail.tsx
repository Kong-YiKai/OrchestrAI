'use client';

import { useMemo } from 'react';
import { CheckCircle2, Code2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContextPanelNav } from '../ContextPanel';
import { CLARIFICATION_AGENTS } from './ClarificationsList';
import { DetailHeader } from './DetailHeader';
import { useOrchestraStore } from '@/stores/orchestraStore';
import type { ClarificationQuestion } from '@/stores/orchestraStore';
import { getSocket } from '@/lib/socket';

const CUSTOM_OPTION_ID = '__custom__';

const TONE = {
  orange: { card: 'border-[#fde68a] bg-warning-50/40', avatar: 'bg-[#c2410c]' },
  green: { card: 'border-[#8cc7a8] bg-[#f4faf6]', avatar: 'bg-[#2f855a]' },
} as const;

export function ClarificationDetail({ nav, agentId }: { nav: ContextPanelNav; agentId: string }) {
  const agent = CLARIFICATION_AGENTS.find((a) => a.id === agentId) ?? CLARIFICATION_AGENTS[0];
  const tone = TONE[agent.tone];
  const {
    clarificationQuestions,
    sessionId,
    updateClarificationDraft,
    confirmClarifications,
  } = useOrchestraStore();

  const allConfirmed = clarificationQuestions.length > 0 && clarificationQuestions.every((q) => q.confirmed);

  const readyToConfirm = useMemo(
    () =>
      clarificationQuestions.length > 0 &&
      clarificationQuestions.every((q) => {
        if (q.selected_option_id === CUSTOM_OPTION_ID) return Boolean(q.custom_answer?.trim());
        return Boolean(q.selected_option_id);
      }),
    [clarificationQuestions],
  );

  const handleSelect = (q: ClarificationQuestion, optionId: string) => {
    if (q.confirmed) return;
    updateClarificationDraft(q.id, { selected_option_id: optionId });
  };

  const handleCustomChange = (q: ClarificationQuestion, value: string) => {
    if (q.confirmed) return;
    updateClarificationDraft(q.id, { custom_answer: value });
  };

  const handleConfirmAll = () => {
    if (!readyToConfirm || allConfirmed) return;

    const lines = clarificationQuestions.map((q) => {
      let answerText = '';
      if (q.selected_option_id === CUSTOM_OPTION_ID) {
        answerText = q.custom_answer?.trim() ?? '';
      } else {
        const opt = q.options?.find((o) => o.id === q.selected_option_id);
        answerText = opt?.label ?? '';
      }
      return `Q: ${q.question}\nA: ${answerText}`;
    });

    confirmClarifications();

    const socket = getSocket();
    socket.emit('chat_send', {
      content: lines.join('\n\n'),
      session_id: sessionId,
    });
  };

  return (
    <>
      <DetailHeader
        title={`${agent.name} — Decisions`}
        onBack={() => nav.goBack({ name: 'clarifications' })}
      />
      <div className="flex flex-col gap-4 px-5 py-5">
        <div className={cn('flex items-center gap-3 rounded-[14px] border p-3', tone.card)}>
          <span
            className={cn(
              'grid h-10 w-10 flex-shrink-0 place-items-center rounded-[10px] text-[13px] font-semibold text-white',
              tone.avatar,
            )}
          >
            {agent.name.charAt(0)}
          </span>
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-ink">
              {agent.name} <span className="text-ink-muted">·</span>{' '}
              <span className="font-medium text-ink-soft">{agent.role}</span>
            </p>
            <p className="text-[12px] text-ink-muted">{agent.task}</p>
          </div>
        </div>

        {clarificationQuestions.length === 0 ? (
          <p className="text-[12.5px] text-ink-muted">暂无待澄清问题。</p>
        ) : (
          clarificationQuestions.map((q) => (
            <DecisionCard
              key={q.id}
              question={q}
              onSelect={(optionId) => handleSelect(q, optionId)}
              onCustomChange={(v) => handleCustomChange(q, v)}
              disabled={Boolean(q.confirmed)}
            />
          ))
        )}

        <button
          type="button"
          onClick={handleConfirmAll}
          disabled={!readyToConfirm || allConfirmed}
          className={cn(
            'mt-1 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[12px] text-[13px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
            allConfirmed
              ? 'cursor-default bg-success-500 text-white'
              : readyToConfirm
                ? 'bg-[#1c1917] text-white hover:bg-[#2a2724] active:scale-[0.99]'
                : 'cursor-not-allowed bg-canvas-soft text-ink-muted',
          )}
        >
          <CheckCircle2 className="h-4 w-4" strokeWidth={2.2} />
          {allConfirmed ? 'Selection Confirmed' : 'Confirm Selection'}
        </button>
      </div>
    </>
  );
}

function DecisionCard({
  question,
  onSelect,
  onCustomChange,
  disabled,
}: {
  question: ClarificationQuestion;
  onSelect: (optionId: string) => void;
  onCustomChange: (value: string) => void;
  disabled: boolean;
}) {
  const options = question.options ?? [];
  const selected = question.selected_option_id ?? '';
  const isCustom = selected === CUSTOM_OPTION_ID;

  return (
    <div className="rounded-[14px] border border-hairline bg-surface p-4">
      <div className="flex items-center gap-2">
        <Code2 className="h-4 w-4 text-warning-500" strokeWidth={1.8} />
        <p className="text-[14px] font-semibold text-ink">{question.question}</p>
      </div>
      {question.hint && (
        <p className="mt-1 text-[12px] text-ink-muted">{question.hint}</p>
      )}

      <ul className="mt-3 flex flex-col gap-2">
        {options.map((o) => (
          <OptionRow
            key={o.id}
            active={selected === o.id}
            disabled={disabled}
            onClick={() => onSelect(o.id)}
            label={o.label}
            meta={o.meta}
          />
        ))}
        <OptionRow
          active={isCustom}
          disabled={disabled}
          onClick={() => onSelect(CUSTOM_OPTION_ID)}
          label="Others"
          meta="自定义输入你的回答"
        />
        {isCustom && (
          <li>
            <input
              type="text"
              value={question.custom_answer ?? ''}
              onChange={(e) => onCustomChange(e.target.value)}
              disabled={disabled}
              placeholder="输入你的自定义回答…"
              className="h-10 w-full rounded-[10px] border border-hairline bg-canvas px-3 text-[13px] text-ink placeholder:text-ink-muted focus:border-brand-500 focus:outline-none disabled:opacity-60"
            />
          </li>
        )}
      </ul>
    </div>
  );
}

function OptionRow({
  active,
  disabled,
  onClick,
  label,
  meta,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
  meta?: string;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'flex w-full items-start gap-3 rounded-[12px] border px-3 py-2.5 text-left transition-colors',
          active
            ? 'border-[#fcd34d] bg-warning-50/60'
            : 'border-hairline bg-canvas hover:border-[#fcd34d]',
          disabled && 'cursor-not-allowed opacity-70',
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-ink">{label}</p>
          {meta && <p className="text-[11.5px] text-ink-muted">{meta}</p>}
        </div>
        <span
          className={cn(
            'mt-0.5 grid h-4 w-4 flex-shrink-0 place-items-center rounded-full ring-1',
            active ? 'ring-warning-500' : 'ring-hairline',
          )}
        >
          {active && <span className="h-2 w-2 rounded-full bg-warning-500" />}
        </span>
      </button>
    </li>
  );
}
