'use client';

import { CloudSun, Globe, Plus, ShoppingCart } from 'lucide-react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type Project = {
  id: string;
  title: string;
  lastActive: string;
  icon: ReactNode;
};

const RECENT_PROJECTS: Project[] = [
  {
    id: 'wx',
    title: '3D Weather App',
    lastActive: 'Active · Claude 4.6',
    icon: <CloudSun className="h-[18px] w-[18px]" strokeWidth={1.8} />,
  },
  {
    id: 'ec',
    title: 'E-commerce API',
    lastActive: '2h ago',
    icon: <ShoppingCart className="h-[18px] w-[18px]" strokeWidth={1.8} />,
  },
  {
    id: 'pf',
    title: 'Portfolio Website',
    lastActive: 'Yesterday',
    icon: <Globe className="h-[18px] w-[18px]" strokeWidth={1.8} />,
  },
];

interface Props {
  activeId: string;
  onSelect: (id: string) => void;
}

export function RecentProjectsPanel({ activeId, onSelect }: Props) {
  return (
    <div className="flex h-full flex-col gap-5 p-5">
      <button
        type="button"
        className="group relative flex h-11 items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-b from-brand-400 to-brand-600 text-[13.5px] font-semibold text-white shadow-brand-glow transition-all hover:-translate-y-[1px] hover:shadow-brand-glow-hover active:scale-[0.98] focus-ring"
      >
        <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_55%)]" />
        <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/35 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
        <Plus className="relative h-[17px] w-[17px]" strokeWidth={2.4} />
        <span className="relative">New Project Chat</span>
      </button>

      <div>
        <p className="px-1 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Recent Projects
        </p>
        <ul className="flex flex-col gap-1">
          {RECENT_PROJECTS.map((p) => {
            const active = p.id === activeId;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelect(p.id)}
                  className={cn(
                    'relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                    active
                      ? 'text-ink'
                      : 'text-ink-soft hover:bg-surface-subtle hover:text-ink'
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="recent-project-active"
                      className="absolute inset-0 rounded-xl bg-surface shadow-card ring-1 ring-hairline"
                      transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                    />
                  )}
                  <span
                    className={cn(
                      'relative grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg transition-colors',
                      active
                        ? 'bg-gradient-to-br from-brand-100 to-brand-300 text-brand-700 shadow-[0_4px_10px_-4px_rgba(255,105,0,0.35)]'
                        : 'bg-canvas-soft text-ink-muted'
                    )}
                  >
                    {p.icon}
                  </span>
                  <div className="relative min-w-0">
                    <p className="truncate text-[13.5px] font-medium">{p.title}</p>
                    <p className="truncate text-[11px] text-ink-muted">{p.lastActive}</p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
