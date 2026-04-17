import { Sparkles } from 'lucide-react';

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md rounded-[20px] border border-hairline bg-surface px-8 py-10 text-center shadow-[0_1px_0_rgba(0,0,0,0.02)]">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-brand-50 text-brand-600">
          <Sparkles className="h-6 w-6" strokeWidth={1.8} />
        </span>
        <h1 className="mt-4 text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-2 text-[13px] leading-[1.55] text-ink-muted">{description}</p>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          Coming in a later phase
        </p>
      </div>
    </div>
  );
}
