'use client';

import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContextPanelNav } from '../ContextPanel';
import { DetailHeader } from './DetailHeader';

export type ClarificationAgent = {
  id: string;
  name: string;
  role: string;
  tone: 'green' | 'orange';
  task: string;
  pending: number;
};

export const CLARIFICATION_AGENTS: ClarificationAgent[] = [
  {
    id: 'gpt-5-4',
    name: 'GPT-5.4',
    role: 'Strategist',
    tone: 'green',
    task: 'Weather API & Deployment Strategy',
    pending: 1,
  },
  {
    id: 'claude-4-6',
    name: 'Claude-4.6',
    role: 'Architect',
    tone: 'orange',
    task: '3D Rendering Engine Selection',
    pending: 1,
  },
];

const TONE = {
  green: {
    card: 'border-[#8cc7a8] bg-[#f4faf6]',
    avatar: 'bg-[#2f855a]',
  },
  orange: {
    card: 'border-[#fde68a] bg-warning-50/40',
    avatar: 'bg-[#c2410c]',
  },
} as const;

export function ClarificationsList({ nav }: { nav: ContextPanelNav }) {
  return (
    <>
      <DetailHeader title="Clarifications" onBack={() => nav.goBack({ name: 'overview' })} />
      <div className="px-5 py-5">
        <p className="mb-4 text-[12.5px] leading-[1.55] text-ink-muted">
          Two agents are working in parallel and need your input before continuing.
        </p>
        <div className="flex flex-col gap-3">
          {CLARIFICATION_AGENTS.map((a) => {
            const tone = TONE[a.tone];
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => nav.goTo({ name: 'clarification-agent', agentId: a.id })}
                className={cn(
                  'group flex w-full flex-col gap-3 rounded-[14px] border p-4 text-left transition-shadow',
                  'hover:shadow-[0_4px_20px_-12px_rgba(28,25,23,0.15)]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
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
                      <span className="inline-flex items-center rounded-md bg-canvas-soft px-2 py-0.5 text-[11px] text-ink-soft">
                        {a.role}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-ink-muted">{a.task}</p>
                  </div>
                  <ChevronRight
                    className="mt-1.5 h-4 w-4 flex-shrink-0 text-ink-muted"
                    strokeWidth={1.8}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] text-ink-muted">Pending decisions</span>
                  <span className="inline-flex items-center rounded-full bg-[#fde2ec] px-2.5 py-1 text-[11.5px] font-semibold text-[#e11d74]">
                    {a.pending} awaiting
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
