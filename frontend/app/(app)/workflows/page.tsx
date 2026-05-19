'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Workflow as WorkflowIcon,
  Sparkles,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import { listWorkflows } from '@/lib/api';
import type { WorkflowSummary } from '@/types/workflow';

type PageState =
  | { status: 'loading' }
  | { status: 'ready'; items: WorkflowSummary[] }
  | { status: 'error'; message: string };

export default function WorkflowsPage() {
  const [state, setState] = useState<PageState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    listWorkflows()
      .then((items) => {
        if (!cancelled) setState({ status: 'ready', items });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col px-8 pb-12 pt-8">
      <PageHeader count={state.status === 'ready' ? state.items.length : null} />
      <div className="mt-8 min-h-0 flex-1">
        {state.status === 'loading' && <LoadingSkeleton />}
        {state.status === 'error' && <ErrorState message={state.message} />}
        {state.status === 'ready' && state.items.length === 0 && <EmptyState />}
        {state.status === 'ready' && state.items.length > 0 && (
          <WorkflowGrid items={state.items} />
        )}
      </div>
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────────────────────

function PageHeader({ count }: { count: number | null }) {
  return (
    <header className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">
          Workflows
        </h1>
        <p className="mt-1 text-[12.5px] text-ink-muted">
          {count === null
            ? 'Loading workflows…'
            : count === 0
              ? 'No workflows yet — generate your first one in Orchestra.'
              : `${count} ${count === 1 ? 'workflow' : 'workflows'}`}
        </p>
      </div>

      <Link
        href="/orchestra"
        className="group relative inline-flex h-10 flex-shrink-0 items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-b from-brand-500 to-brand-600 px-4 text-[13px] font-semibold text-white shadow-brand-glow transition-transform hover:scale-[1.02] active:scale-[0.98] focus-ring"
      >
        <Sparkles className="h-4 w-4" strokeWidth={2} />
        New Workflow
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full"
        />
      </Link>
    </header>
  );
}

// ── Grid + Card ─────────────────────────────────────────────────────────────

function WorkflowGrid({ items }: { items: WorkflowSummary[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((wf, idx) => (
        <WorkflowCard key={wf.workflow_id} wf={wf} index={idx} />
      ))}
    </div>
  );
}

function WorkflowCard({ wf, index }: { wf: WorkflowSummary; index: number }) {
  const displayTitle = wf.title_zh || wf.title || 'Untitled Workflow';
  const displayDescription =
    wf.description?.trim() ||
    `A ${wf.node_count}-node workflow ready to execute.`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index, 8) * 0.04, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={`/workflows/${wf.workflow_id}`}
        className="hover-lift group flex h-full flex-col gap-4 rounded-[18px] border border-hairline bg-surface p-5 shadow-card transition-colors hover:border-hairline-strong focus-ring"
      >
        <div className="flex items-start gap-4">
          <span className="relative grid h-12 w-12 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-100 to-brand-300 text-brand-700 shadow-card ring-1 ring-hairline">
            <WorkflowIcon className="h-5 w-5" strokeWidth={1.7} />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              style={{ background: 'radial-gradient(circle at 30% 20%, rgba(255,159,46,0.22), transparent 65%)' }}
            />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-semibold tracking-tight text-ink">
              {displayTitle}
            </h3>
            <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-[1.55] text-ink-muted">
              {displayDescription}
            </p>
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-hairline pt-3 text-[11.5px] text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" strokeWidth={1.8} />
            {wf.node_count} {wf.node_count === 1 ? 'node' : 'nodes'}
          </span>
          <span className="tabular-nums">{formatCreatedAt(wf.created_at)}</span>
        </div>
      </Link>
    </motion.div>
  );
}

// ── States ──────────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-[152px] animate-pulse rounded-[18px] border border-hairline bg-surface-subtle"
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="grid h-full min-h-[320px] place-items-center">
      <div className="flex flex-col items-center gap-5 text-center">
        <span className="relative grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-brand-100 to-brand-300 text-brand-700 shadow-elevated ring-1 ring-white/50">
          <WorkflowIcon className="h-7 w-7" strokeWidth={1.6} />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl"
            style={{ background: 'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.5), transparent 55%)' }}
          />
        </span>
        <div className="max-w-[380px]">
          <p className="text-[16px] font-semibold tracking-tight text-ink">
            No workflows yet
          </p>
          <p className="mt-1.5 text-[12.5px] leading-[1.6] text-ink-muted">
            Head to <span className="font-semibold text-ink">Orchestra</span>,
            describe a goal, and OrchestrAI will clarify, confirm, and build the
            workflow for you.
          </p>
        </div>
        <Link
          href="/orchestra"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-b from-brand-500 to-brand-600 px-4 text-[13px] font-semibold text-white shadow-brand-glow transition-transform hover:scale-[1.02] active:scale-[0.98] focus-ring"
        >
          <Sparkles className="h-4 w-4" strokeWidth={2} />
          Open Orchestra
        </Link>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="grid h-full min-h-[320px] place-items-center">
      <div className="flex max-w-[420px] flex-col items-center gap-4 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-danger-50 text-danger-500 ring-1 ring-danger-500/20">
          <AlertTriangle className="h-6 w-6" strokeWidth={1.8} />
        </span>
        <div>
          <p className="text-[15px] font-semibold text-ink">Couldn&apos;t load workflows</p>
          <p className="mt-1.5 text-[12.5px] text-ink-muted">{message}</p>
        </div>
      </div>
    </div>
  );
}

// ── Utilities ───────────────────────────────────────────────────────────────

function formatCreatedAt(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}
