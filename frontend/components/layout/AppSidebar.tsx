'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Compass,
  LayoutGrid,
  MessageSquare,
  Settings,
  Sparkles,
  Swords,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
};

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/orchestra', label: 'The Orchestra', icon: MessageSquare },
  { href: '/workflows', label: 'Workflows', icon: Workflow },
  { href: '/marketplace', label: 'Marketplace', icon: Compass },
  { href: '/arena', label: 'Arena Mode', icon: Swords },
  { href: '/team', label: 'Team', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[240px] flex-shrink-0 flex-col border-r border-hairline bg-canvas/70 backdrop-blur-xl px-4 py-5">
      {/* Brand */}
      <Link href="/dashboard" className="mb-8 flex items-center gap-2.5 px-1">
        <motion.span
          whileHover={{ rotate: -6, scale: 1.05 }}
          transition={{ type: 'spring', stiffness: 400, damping: 18 }}
          className="relative grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700 text-white shadow-brand-glow"
        >
          <Zap className="relative z-10 h-[18px] w-[18px] fill-current" strokeWidth={0} />
          <span className="pointer-events-none absolute inset-0 rounded-xl bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.45),transparent_55%)]" />
        </motion.span>
        <div className="flex flex-col leading-none">
          <span className="text-[17px] font-bold tracking-tight text-ink">OrchestrAI</span>
          <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            v1.0 · Preview
          </span>
        </div>
      </Link>

      {/* Section label */}
      <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
        Workspace
      </p>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition-colors',
                active
                  ? 'text-ink'
                  : 'text-ink-soft hover:bg-surface-subtle hover:text-ink'
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active-bg"
                  className="absolute inset-0 rounded-lg bg-surface shadow-card ring-1 ring-hairline"
                  transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                />
              )}
              <span
                className={cn(
                  'relative grid h-7 w-7 place-items-center rounded-md transition-colors',
                  active
                    ? 'bg-gradient-to-br from-brand-400/90 to-brand-600 text-white shadow-[0_4px_10px_-4px_rgba(255,105,0,0.55)]'
                    : 'bg-transparent text-ink-muted group-hover:text-ink-soft'
                )}
              >
                <Icon className="h-[15px] w-[15px]" strokeWidth={active ? 2.2 : 1.8} />
              </span>
              <span className="relative">{label}</span>
              {active && (
                <motion.span
                  layoutId="sidebar-active-dot"
                  className="relative ml-auto h-1.5 w-1.5 rounded-full bg-brand-500"
                  transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Pro Plan upsell — refined */}
      <div className="relative mt-auto overflow-hidden rounded-xl border border-hairline bg-surface p-4 shadow-card">
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-70 blur-2xl"
          style={{ background: 'radial-gradient(circle, rgba(255,159,46,0.6), transparent 60%)' }}
        />
        <div className="relative">
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-700">
            <Sparkles className="h-2.5 w-2.5" strokeWidth={2.4} />
            Pro Plan
          </span>
          <p className="mt-2 text-[13px] font-semibold leading-tight text-ink">
            Unlock unlimited Arena matches
          </p>
          <p className="mt-1 text-[11px] leading-[1.4] text-ink-muted">
            Multi-AI fan-out · Private marketplace
          </p>
          <button
            type="button"
            className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg bg-ink px-3 text-[12.5px] font-semibold text-canvas transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            Upgrade Now
          </button>
        </div>
      </div>
    </aside>
  );
}
