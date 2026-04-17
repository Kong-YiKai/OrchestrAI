'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Compass,
  LayoutGrid,
  MessageSquare,
  Settings,
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
    <aside className="flex h-full w-[240px] flex-shrink-0 flex-col border-r border-hairline bg-canvas px-5 py-6">
      {/* Logo */}
      <Link href="/dashboard" className="mb-10 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-brand-50 text-brand-600">
          <Zap className="h-5 w-5 fill-current" strokeWidth={0} />
        </span>
        <span className="text-[18px] font-bold tracking-tight text-ink">OrchestrAI</span>
      </Link>

      {/* Nav */}
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'group flex items-center gap-3 rounded-[10px] px-3 py-2 text-[14px] font-medium transition-colors',
                active
                  ? 'bg-surface text-ink shadow-sm ring-1 ring-hairline'
                  : 'text-ink-soft hover:bg-surface-subtle hover:text-ink'
              )}
            >
              <Icon
                className={cn('h-[18px] w-[18px]', active ? 'text-brand-500' : 'text-ink-muted group-hover:text-ink-soft')}
                strokeWidth={1.8}
              />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Pro Plan upsell */}
      <div className="mt-auto rounded-[14px] border border-hairline bg-surface p-4">
        <p className="text-[14px] font-semibold text-ink">Pro Plan</p>
        <p className="mt-1 text-[11px] leading-4 text-ink-muted">
          Upgrade for unlimited Arena matches
        </p>
        <button
          type="button"
          className="mt-3 w-full rounded-[10px] bg-gradient-to-b from-brand-400 to-brand-500 py-2 text-[13px] font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.3)_inset,0_1px_2px_rgba(187,77,0,0.3)] transition-transform active:scale-[0.98]"
        >
          Upgrade Now
        </button>
      </div>
    </aside>
  );
}
