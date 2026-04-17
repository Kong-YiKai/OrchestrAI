'use client';

import { ArrowLeft } from 'lucide-react';

type DetailHeaderProps = {
  title: string;
  onBack: () => void;
};

export function DetailHeader({ title, onBack }: DetailHeaderProps) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-hairline bg-canvas px-5 pb-4 pt-5">
      <button
        type="button"
        aria-label="Back"
        onClick={onBack}
        className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-surface ring-1 ring-hairline transition-colors hover:bg-canvas-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <ArrowLeft className="h-4 w-4 text-ink" strokeWidth={1.8} />
      </button>
      <p className="text-[17px] font-semibold text-ink">{title}</p>
    </div>
  );
}
