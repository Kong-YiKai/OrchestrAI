'use client';

import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContextPanelNav } from '../ContextPanel';
import { DetailHeader } from './DetailHeader';
import { useOrchestraStore } from '@/stores/orchestraStore';
import type { HistoryEntry } from '@/stores/orchestraStore';

export function HistoryTimeline({ nav }: { nav: ContextPanelNav }) {
  const { historyEntries } = useOrchestraStore();
  const reversed = [...historyEntries].reverse();

  return (
    <>
      <DetailHeader title="History" onBack={() => nav.goBack({ name: 'overview' })} />
      <div className="px-5 py-5">
        <p className="mb-5 text-[12.5px] leading-[1.55] text-ink-muted">
          本次会话的完整操作记录。
        </p>
        {historyEntries.length === 0 ? (
          <p className="text-[12.5px] text-ink-muted">暂无记录</p>
        ) : (
          <div className="relative pl-7">
            <span
              className="pointer-events-none absolute left-[11px] top-2 bottom-2 w-px bg-hairline"
              aria-hidden
            />
            <ol className="flex flex-col">
              {reversed.map((e, idx) => (
                <li key={e.entry_id} className="relative pb-4 last:pb-0">
                  <HistoryDot isCurrent={idx === 0} />
                  <HistoryCard entry={e} />
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </>
  );
}

function HistoryDot({ isCurrent }: { isCurrent: boolean }) {
  if (isCurrent) {
    return (
      <span
        className="absolute -left-7 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-success-100 ring-2 ring-canvas"
        aria-hidden
      >
        <span className="h-2.5 w-2.5 rounded-full bg-success-500" />
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

function HistoryCard({ entry }: { entry: HistoryEntry }) {
  return (
    <div className="ml-2 rounded-[12px] border border-hairline bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13.5px] font-semibold text-ink">{entry.action}</p>
        <span className="flex-shrink-0 text-[11px] text-ink-muted">
          {new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      {entry.detail && (
        <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-muted">{entry.detail}</p>
      )}
      <div className="mt-2.5">
        <button
          type="button"
          disabled
          className="inline-flex h-7 cursor-not-allowed items-center gap-1.5 rounded-full bg-canvas-soft px-2.5 text-[12px] font-semibold text-ink-muted opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
          Undo
        </button>
      </div>
    </div>
  );
}
