'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-[13px]">
      <ol className="flex min-w-0 items-center gap-1">
        {items.map((item, idx) => {
          const last = idx === items.length - 1;
          return (
            <li key={idx} className="flex min-w-0 items-center gap-1">
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="truncate text-ink-muted transition-colors hover:text-ink"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    'truncate',
                    last ? 'font-semibold text-ink' : 'text-ink-muted'
                  )}
                >
                  {item.label}
                </span>
              )}
              {!last && (
                <ChevronRight
                  className="h-3.5 w-3.5 flex-shrink-0 text-ink-muted"
                  strokeWidth={1.8}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
