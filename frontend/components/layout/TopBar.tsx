'use client';

import { Bell, Search, Sparkles } from 'lucide-react';

export function TopBar() {
  return (
    <header className="relative flex h-[64px] flex-shrink-0 items-center gap-4 border-b border-hairline bg-glass px-6">
      {/* Search */}
      <label className="group relative flex h-10 flex-1 max-w-[520px] items-center rounded-xl bg-surface ring-1 ring-hairline shadow-card transition-all focus-within:ring-2 focus-within:ring-brand-500/50 focus-within:shadow-card-md">
        <Search className="absolute left-3.5 h-4 w-4 text-ink-muted transition-colors group-focus-within:text-brand-500" strokeWidth={2} />
        <input
          type="search"
          placeholder="Search agents, workflows, marketplace…"
          className="h-full w-full rounded-xl bg-transparent pl-10 pr-20 text-[13px] placeholder:text-ink-muted focus:outline-none"
        />
        <span className="absolute right-3 hidden items-center gap-1 rounded-md bg-canvas-soft px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide text-ink-muted ring-1 ring-hairline md:inline-flex">
          ⌘K
        </span>
      </label>

      <div className="ml-auto flex items-center gap-2.5">
        {/* Notifications */}
        <button
          type="button"
          className="group relative grid h-10 w-10 place-items-center rounded-full bg-surface ring-1 ring-hairline shadow-card transition-all hover:shadow-card-md hover:-translate-y-[1px]"
          aria-label="Notifications"
        >
          <Bell className="h-[17px] w-[17px] text-ink-soft transition-colors group-hover:text-ink" strokeWidth={1.8} />
          <span className="absolute right-2 top-2 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-soft-pulse rounded-full bg-danger-500/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-danger-500 ring-2 ring-surface" />
          </span>
        </button>

        {/* Token pill — refined dark pill */}
        <div className="flex h-10 items-center gap-1.5 rounded-full bg-gradient-to-b from-[#1f1a15] to-[#120e0a] px-3.5 text-[12.5px] font-semibold text-white shadow-[0_2px_8px_-3px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)]">
          <Sparkles className="h-3.5 w-3.5 text-brand-300" strokeWidth={2.2} />
          <span className="tabular">1.2M</span>
          <span className="text-[11px] font-medium text-[#b8aea0]">Tokens</span>
        </div>

        {/* User avatar */}
        <button
          type="button"
          className="relative h-10 w-10 overflow-hidden rounded-full ring-2 ring-surface shadow-card transition-all hover:shadow-card-md hover:scale-[1.05]"
          aria-label="Account"
        >
          <span className="absolute inset-0 bg-gradient-to-br from-success-400 to-success-600" />
          <span className="relative grid h-full w-full place-items-center text-[13px] font-bold text-white">
            MK
          </span>
          <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.4),transparent_55%)]" />
        </button>
      </div>
    </header>
  );
}
