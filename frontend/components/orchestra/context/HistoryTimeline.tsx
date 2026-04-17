'use client';

import { useState } from 'react';
import { RotateCcw, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContextPanelNav } from '../ContextPanel';
import { DetailHeader } from './DetailHeader';

type HistoryEntry = {
  id: string;
  label: string;
  meta: string;
  time: string;
  reversible: boolean;
  undone: boolean;
};

const SEED: HistoryEntry[] = [
  {
    id: 'h1',
    label: 'API Provider Selected',
    meta: 'OpenWeather API approved by user.',
    time: '10:44 AM',
    reversible: true,
    undone: false,
  },
  {
    id: 'h2',
    label: 'Vercel Deployment Confirmed',
    meta: 'User selected Vercel as deployment target.',
    time: '10:43 AM',
    reversible: true,
    undone: false,
  },
  {
    id: 'h3',
    label: 'Workflow Generated',
    meta: 'Created 6 nodes based on requirements.',
    time: '10:42 AM',
    reversible: true,
    undone: false,
  },
  {
    id: 'h4',
    label: 'Project Initiated',
    meta: 'Started by YiKai.',
    time: '10:41 AM',
    reversible: false,
    undone: false,
  },
];

export function HistoryTimeline({ nav }: { nav: ContextPanelNav }) {
  const [entries, setEntries] = useState<HistoryEntry[]>(SEED);

  const toggle = (id: string) =>
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, undone: !e.undone } : e))
    );

  const currentId = entries.find((e) => e.reversible && !e.undone)?.id;

  return (
    <>
      <DetailHeader title="History" onBack={() => nav.goBack({ name: 'overview' })} />
      <div className="px-5 py-5">
        <p className="mb-5 text-[12.5px] leading-[1.55] text-ink-muted">
          All actions taken in this session. You can undo reversible actions.
        </p>
        <div className="relative pl-7">
          <span
            className="pointer-events-none absolute left-[11px] top-2 bottom-2 w-px bg-hairline"
            aria-hidden
          />
          <ol className="flex flex-col">
            {entries.map((e) => (
              <li key={e.id} className="relative pb-4 last:pb-0">
                <HistoryDot
                  state={e.undone ? 'undone' : e.id === currentId ? 'current' : 'done'}
                />
                <HistoryCard entry={e} onToggle={() => toggle(e.id)} />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </>
  );
}

function HistoryDot({ state }: { state: 'current' | 'done' | 'undone' }) {
  if (state === 'current') {
    return (
      <span
        className="absolute -left-7 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-success-100 ring-2 ring-canvas"
        aria-hidden
      >
        <span className="h-2.5 w-2.5 rounded-full bg-success-500" />
      </span>
    );
  }
  if (state === 'undone') {
    return (
      <span
        className="absolute -left-7 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-canvas-soft ring-2 ring-canvas"
        aria-hidden
      >
        <RotateCcw className="h-2.5 w-2.5 text-ink-muted" strokeWidth={2} />
      </span>
    );
  }
  return (
    <span
      className="absolute -left-7 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-canvas-soft ring-2 ring-canvas"
      aria-hidden
    >
      <span className="h-2 w-2 rounded-full bg-ink-muted/40" />
    </span>
  );
}

function HistoryCard({
  entry,
  onToggle,
}: {
  entry: HistoryEntry;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        'ml-2 rounded-[12px] border border-hairline bg-surface p-3 transition-opacity',
        entry.undone && 'opacity-75'
      )}
      aria-label={entry.undone ? `${entry.label} (undone)` : entry.label}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className={cn(
            'text-[13.5px] font-semibold text-ink',
            entry.undone && 'text-ink-muted line-through'
          )}
        >
          {entry.label}
        </p>
        <span className="flex-shrink-0 text-[11px] text-ink-muted">{entry.time}</span>
      </div>
      <p
        className={cn(
          'mt-0.5 text-[12px] text-ink-muted',
          entry.undone && 'line-through'
        )}
      >
        {entry.meta}
      </p>
      {entry.reversible && (
        <div className="mt-2.5">
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-full bg-canvas-soft px-2.5 text-[12px] font-semibold transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
              entry.undone ? 'text-success-600' : 'text-ink-soft'
            )}
          >
            {entry.undone ? (
              <>
                <RotateCw className="h-3.5 w-3.5" strokeWidth={2} />
                Redo
              </>
            ) : (
              <>
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
                Undo
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
