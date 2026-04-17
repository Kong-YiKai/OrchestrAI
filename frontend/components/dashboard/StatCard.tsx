'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  icon: ReactNode;
  iconTone: 'brand' | 'success' | 'warning' | 'danger';
  syncing?: boolean;
}

const TONE_CLASSES: Record<StatCardProps['iconTone'], string> = {
  brand: 'bg-brand-50 text-brand-600',
  success: 'bg-success-50 text-success-600',
  warning: 'bg-warning-50 text-warning-500',
  danger: 'bg-[#ffe2e7] text-danger-500',
};

export function StatCard({ label, value, icon, iconTone, syncing = true }: StatCardProps) {
  return (
    <div className="rounded-[16px] border border-hairline bg-surface p-5 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[12px] font-medium text-ink-muted">{label}</p>
          <p className="mt-2 text-[30px] font-bold leading-none tracking-tight text-ink">
            {value}
          </p>
        </div>
        <span
          className={cn(
            'grid h-10 w-10 place-items-center rounded-[12px]',
            TONE_CLASSES[iconTone]
          )}
        >
          {icon}
        </span>
      </div>
      {syncing && (
        <div className="mt-5 flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-500/50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success-500" />
          </span>
          <span className="text-[11px] text-ink-muted">Live sync active</span>
        </div>
      )}
    </div>
  );
}
