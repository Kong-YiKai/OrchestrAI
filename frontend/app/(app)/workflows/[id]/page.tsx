'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, SearchX } from 'lucide-react';
import { WorkflowCanvas } from '@/components/workflows/WorkflowCanvas';
import { useWorkflowStore } from '@/stores/workflowStore';

export default function WorkflowDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const workflowId = useWorkflowStore((s) => s.workflowId);
  const workflow = useWorkflowStore((s) => s.workflow);
  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow);

  // Tracks which id was confirmed missing by REST so we can render the
  // not-found state without holding duplicate ready/loading state in React
  // (those are derived directly from the store below).
  const [notFoundId, setNotFoundId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    // Already loaded (e.g. arrived from Orchestra where `workflow:ready`
    // populated the store via useSocket) — no REST round-trip needed.
    if (workflow && workflowId === id) return;

    let cancelled = false;
    loadWorkflow(id).then((wf) => {
      if (cancelled) return;
      if (!wf) setNotFoundId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [id, workflow, workflowId, loadWorkflow]);

  if (!id) return <LoadingState />;

  const isReady = Boolean(workflow && workflowId === id);
  const isNotFound = notFoundId === id && !isReady;

  if (isNotFound) return <NotFoundState id={id} />;
  if (isReady) return <WorkflowCanvas />;
  return <LoadingState />;
}

function LoadingState() {
  return (
    <div className="grid h-full place-items-center bg-canvas-soft">
      <div className="flex flex-col items-center gap-3 text-ink-muted">
        <Loader2 className="h-6 w-6 animate-spin" strokeWidth={1.8} />
        <p className="text-[12.5px]">Loading workflow…</p>
      </div>
    </div>
  );
}

function NotFoundState({ id }: { id: string }) {
  return (
    <div className="grid h-full place-items-center bg-canvas-soft">
      <div className="flex max-w-[420px] flex-col items-center gap-4 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-canvas-soft text-ink-muted ring-1 ring-hairline">
          <SearchX className="h-6 w-6" strokeWidth={1.7} />
        </span>
        <div>
          <p className="text-[15px] font-semibold text-ink">Workflow not found</p>
          <p className="mt-1.5 text-[12.5px] text-ink-muted">
            No workflow matches{' '}
            <code className="rounded bg-surface px-1.5 py-0.5 text-[11.5px] font-mono text-ink">
              {id}
            </code>
            . It may have been deleted, or the link is stale.
          </p>
        </div>
        <Link
          href="/workflows"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3.5 text-[12.5px] font-medium text-ink-soft shadow-card transition-all hover:border-hairline-strong hover:text-ink focus-ring"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.9} />
          Back to Workflows
        </Link>
      </div>
    </div>
  );
}
