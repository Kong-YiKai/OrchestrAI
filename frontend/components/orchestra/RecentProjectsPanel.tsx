'use client';

import { CloudSun, Globe, Plus, ShoppingCart } from 'lucide-react';
import type { ReactNode } from 'react';
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
    lastActive: 'Active · Claude 4.5',
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
        className="flex h-11 items-center justify-center gap-2 rounded-[12px] bg-gradient-to-b from-brand-400 to-brand-500 text-[14px] font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.3)_inset,0_4px_12px_-4px_rgba(255,105,0,0.4)] transition-transform active:scale-[0.98]"
      >
        <Plus className="h-[18px] w-[18px]" strokeWidth={2.4} />
        New Project Chat
      </button>

      <div>
        <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
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
                    'flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors',
                    active
                      ? 'bg-surface text-ink shadow-sm ring-1 ring-hairline'
                      : 'text-ink-soft hover:bg-surface-subtle'
                  )}
                >
                  <span
                    className={cn(
                      'grid h-8 w-8 flex-shrink-0 place-items-center rounded-[10px]',
                      active ? 'bg-brand-50 text-brand-600' : 'bg-canvas-soft text-ink-muted'
                    )}
                  >
                    {p.icon}
                  </span>
                  <div className="min-w-0">
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
