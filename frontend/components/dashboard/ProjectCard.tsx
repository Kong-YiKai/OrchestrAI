'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="hover-lift group flex items-start gap-4 rounded-[18px] border border-hairline bg-surface p-5 shadow-card transition-colors hover:border-hairline-strong"
    >
      <span className="relative grid h-12 w-12 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-canvas-soft to-surface-subtle text-ink-soft shadow-card ring-1 ring-hairline">
        <span className="relative z-10">{icon}</span>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: 'radial-gradient(circle at 30% 20%, rgba(255,159,46,0.18), transparent 65%)' }}
        />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-[15.5px] font-semibold tracking-tight text-ink">{title}</h3>
          {typeof memberCount === 'number' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-semibold text-success-700 ring-1 ring-success-500/20">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-soft-pulse rounded-full bg-success-500/60" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-success-500" />
              </span>
              {memberCount}{online ? ' Online' : ''}
            </span>
          )}
        </div>
        <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-[1.55] text-ink-muted">
          {description}
        </p>
      </div>

      {action === 'play' ? (
        <button
          type="button"
          className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-warning-100 to-warning-500 text-[#5b3a00] shadow-[0_6px_16px_-6px_rgba(255,185,0,0.55)] transition-transform hover:scale-105 active:scale-95"
          aria-label="Open"
        >
          <Play className="h-4 w-4 fill-current" strokeWidth={0} />
        </button>
      ) : (
        <button
          type="button"
          className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-canvas-soft hover:text-ink"
          aria-label="More actions"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      )}
    </motion.div>
  );
}
