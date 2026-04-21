'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  icon: ReactNode;
  iconTone: 'brand' | 'success' | 'warning' | 'danger';
  syncing?: boolean;
  delta?: string;
}

const TONE_CLASSES: Record<StatCardProps['iconTone'], string> = {
  brand: 'bg-gradient-to-br from-brand-100 to-brand-300 text-brand-700',
  success: 'bg-gradient-to-br from-success-50 to-success-100 text-success-700',
  warning: 'bg-gradient-to-br from-warning-50 to-warning-100 text-warning-500',
  danger: 'bg-gradient-to-br from-danger-50 to-[#ffd1da] text-danger-500',
};

const TONE_GLOW: Record<StatCardProps['iconTone'], string> = {
  brand: 'rgba(255,105,0,0.18)',
  success: 'rgba(0,188,125,0.14)',
  warning: 'rgba(255,185,0,0.14)',
  danger: 'rgba(255,32,86,0.14)',
};

export function StatCard({ label, value, icon, iconTone, syncing = true, delta }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="hover-lift group relative overflow-hidden rounded-[18px] border border-hairline bg-surface p-5 shadow-card"
    >
      {/* ambient tint */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `radial-gradient(circle, ${TONE_GLOW[iconTone]} 0%, transparent 65%)` }}
      />

      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            {label}
          </p>
          <p className="tabular mt-2.5 text-[32px] font-bold leading-none tracking-tight text-ink">
            {value}
          </p>
          {delta && (
            <p className="mt-1.5 text-[11.5px] font-medium text-success-600">
              {delta}
            </p>
          )}
        </div>
        <span
          className={cn(
            'grid h-11 w-11 place-items-center rounded-xl shadow-card-md ring-1 ring-white/40',
            TONE_CLASSES[iconTone]
          )}
        >
          {icon}
        </span>
      </div>

      {syncing && (
        <div className="relative mt-5 flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-soft-pulse rounded-full bg-success-500/50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success-500" />
          </span>
          <span className="text-[11px] font-medium text-ink-muted">Live sync active</span>
        </div>
      )}
    </motion.div>
  );
}
