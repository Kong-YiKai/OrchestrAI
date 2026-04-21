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

const ACCENT: Record<TaskNodeData['accent'], string> = {
  brand: 'bg-brand-500',
  success: 'bg-success-500',
  violet: 'bg-[#7c3aed]',
  sky: 'bg-[#0ea5e9]',
  warning: 'bg-warning-500',
};

const STATUS_CHIP: Record<TaskNodeStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  online: {
    label: 'Online',
    cls: 'bg-success-50 text-success-700',
    icon: <span className="h-1.5 w-1.5 rounded-full bg-success-500" />,
  },
  running: {
    label: 'Running',
    cls: 'bg-brand-50 text-brand-700',
    icon: <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.4} />,
  },
  queued: {
    label: 'Queued',
    cls: 'bg-canvas-soft text-ink-muted',
    icon: <Clock className="h-3 w-3" strokeWidth={2.4} />,
  },
  complete: {
    label: 'Done',
    cls: 'bg-success-50 text-success-700',
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
        'group relative w-[240px] overflow-visible rounded-[14px] border bg-surface shadow-[0_4px_18px_-10px_rgba(28,25,23,0.2)] transition-shadow',
        selected
          ? 'border-brand-500 shadow-[0_8px_28px_-12px_rgba(255,105,0,0.35)]'
          : 'border-hairline hover:shadow-[0_8px_24px_-12px_rgba(28,25,23,0.2)]',
      )}
    >
      <span className={cn('absolute left-0 top-0 h-full w-1 rounded-l-[14px]', ACCENT[d.accent])} />
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-0 !bg-ink-muted"
      />

      <div className="px-4 py-3.5 pl-5">
        <p className="text-[13.5px] font-semibold leading-tight text-ink">{d.title}</p>
        <p className="mt-1 line-clamp-2 text-[11.5px] leading-[1.4] text-ink-muted">
          {d.summary}
        </p>

        <div className="relative mt-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            className="nodrag inline-flex w-full items-center justify-between gap-2 rounded-[10px] border border-hairline bg-canvas px-2.5 py-1.5 text-[11.5px] font-medium text-ink hover:border-brand-300"
          >
            <span className="inline-flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', model.dot)} />
              {model.label}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-ink-muted" strokeWidth={2} />
          </button>
          {open && (
            <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-[10px] border border-hairline bg-surface shadow-[0_8px_20px_-10px_rgba(28,25,23,0.2)]">
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
                      'nodrag flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11.5px] transition-colors',
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
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold',
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
