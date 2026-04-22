'use client';

import { useState } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Check, ChevronDown, Clock, Loader2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TaskNodeStatus = 'online' | 'running' | 'queued' | 'complete';

export type TaskNodeData = {
  nodeId: string;
  title: string;
  summary: string;
  agents: number;
  status: TaskNodeStatus;
  accent: 'brand' | 'success' | 'violet' | 'sky' | 'warning';
  assignedAi: string;
  onModelChange?: (nodeId: string, model: string) => void;
};

export type TaskNode = Node<TaskNodeData, 'task'>;

const ACCENT_BAR: Record<TaskNodeData['accent'], string> = {
  brand: 'bg-gradient-to-b from-brand-400 to-brand-700',
  success: 'bg-gradient-to-b from-success-400 to-success-600',
  violet: 'bg-gradient-to-b from-[#a78bfa] to-[#6d28d9]',
  sky: 'bg-gradient-to-b from-[#38bdf8] to-[#0369a1]',
  warning: 'bg-gradient-to-b from-warning-100 to-warning-500',
};

const STATUS_CHIP: Record<TaskNodeStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  online: {
    label: 'Online',
    cls: 'bg-success-50 text-success-700 ring-success-500/20',
    icon: <span className="h-1.5 w-1.5 rounded-full bg-success-500" />,
  },
  running: {
    label: 'Running',
    cls: 'bg-brand-50 text-brand-700 ring-brand-500/20',
    icon: <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.4} />,
  },
  queued: {
    label: 'Queued',
    cls: 'bg-canvas-soft text-ink-muted ring-hairline',
    icon: <Clock className="h-3 w-3" strokeWidth={2.4} />,
  },
  complete: {
    label: 'Done',
    cls: 'bg-success-50 text-success-700 ring-success-500/20',
    icon: <Check className="h-3 w-3" strokeWidth={2.4} />,
  },
};

const MODEL_OPTIONS: { id: string; label: string; dot: string }[] = [
  { id: 'claude', label: 'Claude-4.6', dot: 'bg-[#c2410c]' },
  { id: 'gpt', label: 'GPT-4o', dot: 'bg-[#2f855a]' },
  { id: 'gemini', label: 'Gemini', dot: 'bg-[#1d4ed8]' },
  { id: 'grok', label: 'Grok', dot: 'bg-[#6d28d9]' },
];

function modelOption(id: string) {
  return MODEL_OPTIONS.find((m) => m.id === id) ?? MODEL_OPTIONS[0];
}

export function TaskNodeCard({ data, selected }: NodeProps<TaskNode>) {
  const chip = STATUS_CHIP[data.status];
  const d = data;
  const [open, setOpen] = useState(false);
  const model = modelOption(d.assignedAi);

  return (
    <div
      className={cn(
        'group relative w-[256px] overflow-visible rounded-2xl border bg-surface transition-all',
        selected
          ? 'border-brand-500 shadow-[0_12px_36px_-14px_rgba(255,105,0,0.4),0_0_0_4px_rgba(255,105,0,0.1)]'
          : 'border-hairline shadow-card-md hover:shadow-elevated hover:-translate-y-[1px]',
      )}
    >
      {/* accent bar */}
      <span className={cn('absolute left-0 top-0 h-full w-[3px] rounded-l-2xl', ACCENT_BAR[d.accent])} />
      {/* subtle hover glow */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: 'radial-gradient(circle, rgba(255,159,46,0.22) 0%, transparent 65%)' }}
      />

      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-0 !bg-ink-muted"
      />

      <div className="relative px-4 py-3.5 pl-5">
        <p className="text-[13.5px] font-semibold leading-tight tracking-tight text-ink">{d.title}</p>
        <p className="mt-1 line-clamp-2 text-[11.5px] leading-[1.5] text-ink-muted">
          {d.summary}
        </p>

        <div className="relative mt-3.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            className="nodrag inline-flex w-full items-center justify-between gap-2 rounded-lg border border-hairline bg-canvas-soft px-2.5 py-1.5 text-[11.5px] font-medium text-ink transition-all hover:border-brand-300 hover:bg-surface focus-ring"
          >
            <span className="inline-flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', model.dot)} />
              {model.label}
            </span>
            <ChevronDown className={cn('h-3.5 w-3.5 text-ink-muted transition-transform', open && 'rotate-180')} strokeWidth={2} />
          </button>
          {open && (
            <div className="absolute left-0 top-full z-50 mt-1.5 w-full overflow-hidden rounded-lg border border-hairline bg-surface shadow-floating">
              {MODEL_OPTIONS.map((opt) => {
                const active = opt.id === d.assignedAi;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(false);
                      if (opt.id !== d.assignedAi) {
                        d.onModelChange?.(d.nodeId, opt.id);
                      }
                    }}
                    className={cn(
                      'nodrag flex w-full items-center gap-2 px-2.5 py-2 text-left text-[11.5px] transition-colors',
                      active ? 'bg-brand-50 text-brand-700 font-semibold' : 'hover:bg-canvas-soft text-ink',
                    )}
                  >
                    <span className={cn('h-2 w-2 rounded-full', opt.dot)} />
                    <span className="flex-1">{opt.label}</span>
                    {active && <Check className="h-3 w-3" strokeWidth={2.4} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1',
              chip.cls,
            )}
          >
            {chip.icon}
            {chip.label}
          </span>
          <span className="inline-flex items-center gap-1 text-[10.5px] text-ink-muted">
            <Users className="h-3 w-3" strokeWidth={1.8} />
            {d.agents}
          </span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-0 !bg-ink-muted"
      />
    </div>
  );
}
