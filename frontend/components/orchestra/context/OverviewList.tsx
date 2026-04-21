'use client';

import { Boxes, ChevronRight, FileCode2, History, Settings2 } from 'lucide-react';
import type { ComponentType } from 'react';
import { cn } from '@/lib/utils';
import type { ContextPanelNav } from '../ContextPanel';
import { useOrchestraStore } from '@/stores/orchestraStore';
import { useWorkflowStore } from '@/stores/workflowStore';

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
  const { clarificationQuestions, buildingLogs, historyEntries, convState } = useOrchestraStore();
  const { workflow } = useWorkflowStore();

  const pendingClarCount = clarificationQuestions.filter((q) => !q.confirmed).length;
  const clarCount = clarificationQuestions.length;
  const buildNodeCount = workflow?.nodes.length ?? 0;
  const buildCount = buildingLogs.length;
  const historyCount = historyEntries.length;
  const isLive = convState === 'generating';

  const cards: Card[] = [
    {
      key: 'clarifications',
      title: 'Clarifications',
      subtitle:
        pendingClarCount > 0
          ? `${pendingClarCount} 个决策待确认`
          : clarCount > 0
            ? '全部已确认'
            : '等待需求澄清',
      icon: Boxes,
      iconTile: 'bg-[#fde2ec] text-[#e11d74]',
      cardBorder: pendingClarCount > 0 ? 'border-[#f5c6d9]' : 'border-hairline',
      badge: pendingClarCount > 0 ? { kind: 'count', value: pendingClarCount } : undefined,
      onClick: () => nav.goTo({ name: 'clarifications' }),
    },
    {
      key: 'building',
      title: 'Building Process',
      subtitle:
        buildNodeCount > 0
          ? `${buildNodeCount} 个工作节点`
          : buildCount > 0
            ? `${buildCount} 条日志`
            : '等待开始生成',
      icon: Settings2,
      iconTile: 'bg-warning-50 text-warning-500',
      cardBorder: isLive ? 'border-[#fde68a]' : 'border-hairline',
      badge: isLive
        ? { kind: 'live' }
        : buildNodeCount > 0
          ? { kind: 'count', value: buildNodeCount }
          : buildCount > 0
            ? { kind: 'count', value: buildCount }
            : undefined,
      onClick: () => nav.goTo({ name: 'building' }),
    },
    {
      key: 'reports',
      title: 'Agent Reports',
      subtitle: 'Phase 7 中开放',
      icon: FileCode2,
      iconTile: 'bg-canvas-soft text-ink-soft',
      cardBorder: 'border-hairline',
      onClick: () => nav.goTo({ name: 'reports' }),
    },
    {
      key: 'history',
      title: 'History',
      subtitle: historyCount > 0 ? `${historyCount} 条操作记录` : '暂无记录',
      icon: History,
      iconTile: 'bg-canvas-soft text-ink-soft',
      cardBorder: 'border-hairline',
      badge: historyCount > 0 ? { kind: 'count', value: historyCount } : undefined,
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
