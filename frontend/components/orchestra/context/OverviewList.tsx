'use client';

import { Boxes, ChevronRight, FileCode2, History, Settings2 } from 'lucide-react';
import type { ComponentType } from 'react';
import { motion } from 'framer-motion';
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
  tint: string;
  glow: string;
  badge?: { kind: 'count'; value: number; color?: string } | { kind: 'live' };
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
      iconTile: 'bg-gradient-to-br from-[#fde2ec] to-[#f9c1d6] text-[#b1175a]',
      tint: 'rgba(225,29,116,0.08)',
      glow: 'rgba(225,29,116,0.18)',
      badge: pendingClarCount > 0 ? { kind: 'count', value: pendingClarCount, color: 'danger' } : undefined,
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
      iconTile: 'bg-gradient-to-br from-warning-50 to-warning-100 text-warning-500',
      tint: 'rgba(255,185,0,0.08)',
      glow: 'rgba(255,185,0,0.22)',
      badge: isLive
        ? { kind: 'live' }
        : buildNodeCount > 0
          ? { kind: 'count', value: buildNodeCount, color: 'brand' }
          : buildCount > 0
            ? { kind: 'count', value: buildCount, color: 'brand' }
            : undefined,
      onClick: () => nav.goTo({ name: 'building' }),
    },
    {
      key: 'reports',
      title: 'Agent Reports',
      subtitle: 'Phase 7 · 敬请期待',
      icon: FileCode2,
      iconTile: 'bg-gradient-to-br from-canvas-soft to-surface-subtle text-ink-soft',
      tint: 'rgba(28,25,23,0.04)',
      glow: 'rgba(28,25,23,0.08)',
      onClick: () => nav.goTo({ name: 'reports' }),
    },
    {
      key: 'history',
      title: 'History',
      subtitle: historyCount > 0 ? `${historyCount} 条操作记录` : '暂无记录',
      icon: History,
      iconTile: 'bg-gradient-to-br from-canvas-soft to-surface-subtle text-ink-soft',
      tint: 'rgba(28,25,23,0.04)',
      glow: 'rgba(28,25,23,0.08)',
      badge: historyCount > 0 ? { kind: 'count', value: historyCount } : undefined,
      onClick: () => nav.goTo({ name: 'history' }),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {cards.map((c, idx) => {
        const Icon = c.icon;
        return (
          <motion.button
            key={c.key}
            type="button"
            onClick={c.onClick}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, delay: idx * 0.04, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'hover-lift group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border border-hairline bg-surface p-4 text-left shadow-card focus-ring'
            )}
          >
            {/* ambient glow on hover */}
            <span
              aria-hidden
              className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
              style={{ background: `radial-gradient(circle, ${c.glow} 0%, transparent 65%)` }}
            />
            <span
              className={cn(
                'relative grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl shadow-card ring-1 ring-white/40',
                c.iconTile
              )}
            >
              <Icon className="h-[19px] w-[19px]" strokeWidth={1.8} />
            </span>
            <div className="relative min-w-0 flex-1">
              <p className="text-[14.5px] font-semibold tracking-tight text-ink">{c.title}</p>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">{c.subtitle}</p>
            </div>
            {c.badge?.kind === 'count' && (
              <span
                className={cn(
                  'relative inline-flex h-6 min-w-[24px] items-center justify-center rounded-full px-2 text-[11.5px] font-bold',
                  c.badge.color === 'brand'
                    ? 'bg-brand-50 text-brand-700'
                    : 'bg-[#fde2ec] text-[#b1175a]'
                )}
              >
                {c.badge.value}
              </span>
            )}
            {c.badge?.kind === 'live' && (
              <span className="relative inline-flex items-center gap-1 rounded-full bg-warning-50 px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-[#c06a00]">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-soft-pulse rounded-full bg-warning-500/60" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-warning-500" />
                </span>
                Live
              </span>
            )}
            <ChevronRight
              className="relative h-4 w-4 flex-shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink-soft"
              strokeWidth={1.8}
            />
          </motion.button>
        );
      })}
    </div>
  );
}
