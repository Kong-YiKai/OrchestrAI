'use client';

import type { ReactNode } from 'react';
import { MoreHorizontal, Play } from 'lucide-react';

interface ProjectCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  memberCount?: number;
  online?: boolean;
  action?: 'menu' | 'play';
}

export function ProjectCard({
  icon,
  title,
  description,
  memberCount,
  online,
  action = 'menu',
}: ProjectCardProps) {
  return (
    <div className="flex items-start gap-4 rounded-[16px] border border-hairline bg-surface p-5 transition-shadow hover:shadow-[0_4px_24px_-12px_rgba(28,25,23,0.15)]">
      <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-[12px] bg-canvas-soft text-ink-soft">
        {icon}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-[15px] font-semibold text-ink">{title}</h3>
          {typeof memberCount === 'number' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-semibold text-success-700">
              <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
              {memberCount} {online ? 'Online' : ''}
            </span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-[12px] leading-[1.5] text-ink-muted">
          {description}
        </p>
      </div>

      <button
        type="button"
        className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-canvas-soft hover:text-ink"
        aria-label={action === 'play' ? 'Open' : 'More actions'}
      >
        {action === 'play' ? (
          <span className="grid h-9 w-9 place-items-center rounded-full bg-warning-500 text-white">
            <Play className="h-4 w-4 fill-current" strokeWidth={0} />
          </span>
        ) : (
          <MoreHorizontal className="h-5 w-5" />
        )}
      </button>
    </div>
  );
}
