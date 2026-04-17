'use client';

import { Boxes, ChevronRight, FileCode2, History, Settings2 } from 'lucide-react';
import type { ComponentType } from 'react';
import { cn } from '@/lib/utils';
import type { ContextPanelNav } from '../ContextPanel';

type Card = {
  key: 'clarifications' | 'building' | 'reports' | 'history';
  title: string;
  subtitle: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  iconTile: string;
  cardBorder: string;
  badge?: { kind: 'count'; value: number } | { kind: 'live' };
  onClick: () => void;
};

export function OverviewList({ nav }: { nav: ContextPanelNav }) {
  const cards: Card[] = [
    {
      key: 'clarifications',
      title: 'Clarifications',
      subtitle: '2 Agents awaiting decisions',
      icon: Boxes,
      iconTile: 'bg-[#fde2ec] text-[#e11d74]',
      cardBorder: 'border-[#f5c6d9]',
      badge: { kind: 'count', value: 2 },
      onClick: () => nav.goTo({ name: 'clarifications' }),
    },
    {
      key: 'building',
      title: 'Building Process',
      subtitle: '2 Agents running in parallel',
      icon: Settings2,
      iconTile: 'bg-warning-50 text-warning-500',
      cardBorder: 'border-[#fde68a]',
      badge: { kind: 'live' },
      onClick: () => nav.goTo({ name: 'building' }),
    },
    {
      key: 'reports',
      title: 'Agent Reports',
      subtitle: '2 New Updates',
      icon: FileCode2,
      iconTile: 'bg-canvas-soft text-ink-soft',
      cardBorder: 'border-hairline',
      onClick: () => nav.goTo({ name: 'reports' }),
    },
    {
      key: 'history',
      title: 'History',
      subtitle: 'View & undo past actions',
      icon: History,
      iconTile: 'bg-canvas-soft text-ink-soft',
      cardBorder: 'border-hairline',
      onClick: () => nav.goTo({ name: 'history' }),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <button
            key={c.key}
            type="button"
            onClick={c.onClick}
            className={cn(
              'flex w-full items-center gap-4 rounded-[16px] border bg-surface p-4 text-left transition-shadow',
              'hover:shadow-[0_4px_20px_-12px_rgba(28,25,23,0.15)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
              c.cardBorder
            )}
          >
            <span
              className={cn(
                'grid h-11 w-11 flex-shrink-0 place-items-center rounded-[12px]',
                c.iconTile
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15.5px] font-semibold text-ink">{c.title}</p>
              <p className="mt-0.5 text-[12px] text-ink-muted">{c.subtitle}</p>
            </div>
            {c.badge?.kind === 'count' && (
              <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-[#fde2ec] px-2 text-[12px] font-bold text-[#e11d74]">
                {c.badge.value}
              </span>
            )}
            {c.badge?.kind === 'live' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-[#d97706]">
                <span className="h-1.5 w-1.5 rounded-full bg-warning-500" aria-hidden />
                Live
              </span>
            )}
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-muted" strokeWidth={1.8} />
          </button>
        );
      })}
    </div>
  );
}
