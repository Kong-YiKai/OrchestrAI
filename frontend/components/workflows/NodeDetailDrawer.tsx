'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Loader2,
  ScrollText,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkflowStore } from '@/stores/workflowStore';
import type { NodeStatus, ToolType, WorkflowNode } from '@/types/workflow';

type DrawerTab = 'details' | 'result';

const MODEL_LABEL: Record<string, string> = {
  claude: 'Claude 4.6',
  gpt: 'GPT-4o',
  gemini: 'Gemini',
  grok: 'Grok',
};

const TOOL_TYPE_LABEL: Record<ToolType, string> = {
  api: 'API',
  web_automation: 'Web Automation',
  llm: 'LLM',
  code: 'Code',
};

const STATUS_TONE: Record<NodeStatus, { label: string; dot: string; chip: string }> = {
  idle: {
    label: 'Queued',
    dot: 'bg-ink-muted',
    chip: 'bg-canvas-soft text-ink-soft ring-hairline',
  },
  running: {
    label: 'Running',
    dot: 'bg-brand-500',
    chip: 'bg-brand-50 text-brand-700 ring-brand-500/25',
  },
  complete: {
    label: 'Complete',
    dot: 'bg-success-500',
    chip: 'bg-success-100 text-success-700 ring-success-500/25',
  },
  error: {
    label: 'Error',
    dot: 'bg-danger-500',
    chip: 'bg-danger-50 text-danger-500 ring-danger-500/25',
  },
};

interface Props {
  nodeId: string | null;
  onClose: () => void;
}

export function NodeDetailDrawer({ nodeId, onClose }: Props) {
  const node = useWorkflowStore(
    (s) => s.workflow?.nodes.find((n) => n.node_id === nodeId) ?? null,
  );

  const [tab, setTab] = useState<DrawerTab>('details');

  const modelLabel = node ? MODEL_LABEL[node.assigned_ai] ?? node.assigned_ai : '';
  const displayTitle = node?.title || node?.title_zh || '';
  const tone = node ? STATUS_TONE[node.status] : null;

  return (
    <AnimatePresence>
      {node && (
        <motion.aside
          key={node.node_id}
          initial={{ x: '100%', opacity: 0.4 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="absolute right-0 top-0 z-20 flex h-full w-[440px] flex-col border-l border-hairline bg-glass-surface shadow-overlay"
        >
          {/* Header */}
          <div className="border-b border-hairline px-5 pb-0 pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted">
                  Node · Order {node.order + 1}
                </p>
                <h2 className="mt-1 truncate text-[16px] font-semibold tracking-tight text-ink">
                  {displayTitle}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-brand-700 ring-1 ring-brand-500/20">
                    <Sparkles className="h-3 w-3" strokeWidth={2} />
                    {modelLabel}
                  </span>
                  {tone && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider ring-1',
                        tone.chip,
                      )}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
                      {tone.label}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-canvas-soft hover:text-ink"
                aria-label="Close"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            {/* Tabs */}
            <div className="mt-4 flex gap-1">
              <TabButton
                active={tab === 'details'}
                onClick={() => setTab('details')}
                label="Details"
                icon={<ScrollText className="h-3.5 w-3.5" strokeWidth={1.8} />}
              />
              <TabButton
                active={tab === 'result'}
                onClick={() => setTab('result')}
                label="Result"
                icon={<CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.8} />}
              />
            </div>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {tab === 'details' ? <DetailsBody node={node} /> : <ResultBody node={node} />}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function TabButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-1.5 rounded-t-[10px] px-3 py-2 text-[12px] font-medium transition-colors',
        active ? 'bg-surface text-ink ring-1 ring-hairline' : 'text-ink-muted hover:text-ink-soft'
      )}
    >
      {icon}
      {label}
      {active && (
        <motion.span
          layoutId="wf-drawer-tab"
          className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-500"
        />
      )}
    </button>
  );
}

/* ───────────────── Details tab ───────────────── */

function DetailsBody({ node }: { node: WorkflowNode }) {
  const description = node.description?.trim();
  const descriptionZh = node.description_zh?.trim();
  const inputEntries = useMemo(() => Object.entries(node.input_schema ?? {}), [node.input_schema]);
  const outputEntries = useMemo(() => Object.entries(node.output_schema ?? {}), [node.output_schema]);

  return (
    <div className="flex flex-col gap-6 p-5">
      <Section title="Description">
        <div className="space-y-2 rounded-[12px] border border-hairline bg-surface p-3.5">
          {descriptionZh && (
            <p className="text-[12.5px] leading-[1.6] text-ink">{descriptionZh}</p>
          )}
          {description && description !== descriptionZh && (
            <p className="text-[12px] leading-[1.6] text-ink-muted">{description}</p>
          )}
          {!description && !descriptionZh && (
            <p className="text-[12px] italic text-ink-muted">No description provided.</p>
          )}
        </div>
      </Section>

      <Section title="Tool Assignment">
        <div className="rounded-[12px] border border-hairline bg-surface p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-ink">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-canvas-soft text-ink-soft">
                <Wrench className="h-3.5 w-3.5" strokeWidth={1.8} />
              </span>
              {node.assigned_tool || 'Unassigned'}
            </span>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-brand-700 ring-1 ring-brand-500/20">
              {TOOL_TYPE_LABEL[node.tool_type] ?? node.tool_type}
            </span>
          </div>
        </div>
      </Section>

      <Section title="Input Schema" icon={<ArrowDownToLine className="h-3 w-3" strokeWidth={2} />}>
        <SchemaList entries={inputEntries} emptyLabel="No inputs declared." />
      </Section>

      <Section title="Output Schema" icon={<ArrowUpFromLine className="h-3 w-3" strokeWidth={2} />}>
        <SchemaList entries={outputEntries} emptyLabel="No outputs declared." />
      </Section>
    </div>
  );
}

function SchemaList({ entries, emptyLabel }: { entries: [string, string][]; emptyLabel: string }) {
  if (entries.length === 0) {
    return (
      <p className="rounded-[12px] border border-dashed border-hairline bg-surface/40 px-3.5 py-2.5 text-[12px] italic text-ink-muted">
        {emptyLabel}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {entries.map(([key, type]) => (
        <li
          key={key}
          className="flex items-center justify-between gap-3 rounded-[10px] border border-hairline bg-surface px-3 py-2 text-[12.5px]"
        >
          <span className="truncate font-mono text-ink">{key}</span>
          <span className="truncate rounded-md bg-canvas-soft px-1.5 py-0.5 font-mono text-[11.5px] text-ink-soft">
            {type || '—'}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ───────────────── Result tab ───────────────── */

function ResultBody({ node }: { node: WorkflowNode }) {
  if (node.status === 'error') {
    return (
      <div className="p-5">
        <div className="rounded-[14px] border border-danger-500/20 bg-danger-50/40 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-danger-500" strokeWidth={2} />
            <p className="text-[13px] font-semibold text-danger-500">Execution failed</p>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-[1.6] text-ink-soft">
            {node.error || 'No error message captured.'}
          </p>
        </div>
      </div>
    );
  }

  if (node.status === 'running') {
    return (
      <Placeholder
        icon={<Loader2 className="h-5 w-5 animate-spin text-brand-600" strokeWidth={1.8} />}
        title="Running…"
        description="Live output will appear here once the node finishes."
      />
    );
  }

  if (node.status === 'idle' || !node.result) {
    return (
      <Placeholder
        icon={<CheckCircle2 className="h-5 w-5 text-ink-muted" strokeWidth={1.6} />}
        title="Not yet executed"
        description="Queue this workflow to populate the node's result."
      />
    );
  }

  const { summary, summary_zh, raw } = node.result;
  const rawJson = safeStringify(raw);
  const methodLabel = node.execution_method
    ? node.execution_method.charAt(0).toUpperCase() + node.execution_method.slice(1)
    : null;

  return (
    <div className="flex flex-col gap-5 p-5">
      <Section title="Summary">
        <div className="space-y-2 rounded-[12px] border border-hairline bg-surface p-3.5">
          {summary_zh && (
            <p className="text-[12.5px] leading-[1.6] text-ink">{summary_zh}</p>
          )}
          {summary && summary !== summary_zh && (
            <p className="text-[12px] leading-[1.6] text-ink-muted">{summary}</p>
          )}
          {!summary && !summary_zh && (
            <p className="text-[12px] italic text-ink-muted">No summary returned.</p>
          )}
        </div>
      </Section>

      {methodLabel && (
        <Section title="Execution Method">
          <span className="inline-flex items-center gap-1 rounded-full bg-canvas-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-ink-soft ring-1 ring-hairline">
            {methodLabel}
          </span>
        </Section>
      )}

      <Section title="Raw Output">
        <pre className="max-h-[280px] overflow-auto rounded-[12px] border border-hairline bg-canvas-soft p-3 text-[11.5px] leading-[1.55] text-ink-soft scrollbar-thin">
          <code>{rawJson}</code>
        </pre>
      </Section>
    </div>
  );
}

function Placeholder({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="grid h-full min-h-[260px] place-items-center p-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-canvas-soft ring-1 ring-hairline">
          {icon}
        </span>
        <div className="max-w-[280px]">
          <p className="text-[13.5px] font-semibold text-ink">{title}</p>
          <p className="mt-1 text-[12px] leading-[1.55] text-ink-muted">{description}</p>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        {icon}
        {title}
      </p>
      {children}
    </div>
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
