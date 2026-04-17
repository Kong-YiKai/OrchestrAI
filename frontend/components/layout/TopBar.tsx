'use client';

import { Bell, Search, Sparkles } from 'lucide-react';

export function TopBar() {
  return (
    <header className="flex h-[68px] flex-shrink-0 items-center gap-4 border-b border-hairline bg-canvas px-6">
      {/* Search */}
      <label className="relative flex h-10 flex-1 max-w-[560px] items-center rounded-[12px] bg-surface ring-1 ring-hairline focus-within:ring-2 focus-within:ring-brand-500/40">
        <Search className="absolute left-3 h-4 w-4 text-ink-muted" strokeWidth={1.8} />
        <input
          type="search"
          placeholder="Search AI agents, workflows, or marketplace..."
          className="h-full w-full bg-transparent pl-9 pr-20 text-[13px] placeholder:text-ink-muted focus:outline-none"
        />
        <span className="absolute right-3 hidden items-center gap-1 rounded-md bg-canvas-soft px-1.5 py-0.5 text-[11px] font-medium text-ink-muted ring-1 ring-hairline md:inline-flex">
          ⌘K
        </span>
      </label>

      <div className="ml-auto flex items-center gap-3">
        {/* Notifications */}
        <button
          type="button"
          className="relative grid h-10 w-10 place-items-center rounded-full bg-surface ring-1 ring-hairline transition-colors hover:bg-canvas-soft"
          aria-label="Notifications"
        >
          <Bell className="h-[18px] w-[18px] text-ink-soft" strokeWidth={1.8} />
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-danger-500 ring-2 ring-canvas" />
        </button>

        {/* Token pill */}
        <div className="flex h-10 items-center gap-1.5 rounded-full bg-[#1c1917] px-3.5 text-[13px] font-semibold text-white">
          <Sparkles className="h-4 w-4 text-brand-400" strokeWidth={1.8} />
          1.2M Tokens
        </div>

        {/* User avatar */}
        <div className="h-10 w-10 overflow-hidden rounded-full bg-gradient-to-br from-success-500 to-success-600 ring-2 ring-surface">
          <div className="grid h-full w-full place-items-center text-[13px] font-semibold text-white">
            MK
          </div>
        </div>
      </div>
    </header>
  );
}
