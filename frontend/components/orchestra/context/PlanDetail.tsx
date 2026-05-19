'use client';

import { useState } from 'react';
import { CheckCircle2, Lock, Pencil, PlayCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContextPanelNav } from '../ContextPanel';
import { DetailHeader } from './DetailHeader';
import { useOrchestraStore } from '@/stores/orchestraStore';
import { getSocket } from '@/lib/socket';

export function PlanDetail({ nav }: { nav: ContextPanelNav }) {
  const plan = useOrchestraStore((s) => s.plan);
  const convState = useOrchestraStore((s) => s.convState);
  const sessionId = useOrchestraStore((s) => s.sessionId);
  const updatePlanNode = useOrchestraStore((s) => s.updatePlanNode);
  const setConvState = useOrchestraStore((s) => s.setConvState);

  const [isEditing, setIsEditing] = useState(false);

  const planLocked = convState === 'generating' || convState === 'complete';
  const canEdit = convState === 'awaiting_confirm';

  // Plan got cleared — bounce back to clarifications list
  if (!plan) {
    return (
      <>
        <DetailHeader
          title="开始生成工作流"
          onBack={() => nav.goBack({ name: 'clarifications' })}
        />
        <div className="px-5 py-5 text-[12.5px] text-ink-muted">暂无计划。</div>
      </>
    );
  }

  const handleStart = () => {
    if (planLocked) return;
    // Optimistic local lock — backend should also flip convState to 'generating'
    setConvState('generating');
    setIsEditing(false);
    const socket = getSocket();
    socket.emit('chat_confirm_start', { session_id: sessionId });
  };

  return (
    <>
      <DetailHeader
        title="开始生成工作流"
        onBack={() => nav.goBack({ name: 'clarifications' })}
      />
      <div className="flex flex-col gap-4 px-5 py-5">
        {/* Plan summary card */}
        <div className="rounded-[14px] border border-hairline bg-surface p-4">
          <p className="text-[15px] font-semibold text-ink">{plan.title}</p>
          <p className="mt-1 text-[12.5px] leading-[1.55] text-ink-muted">{plan.summary}</p>
          {planLocked && (
            <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-success-100 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-success-700 ring-1 ring-success-500/25">
              <Lock className="h-3 w-3" strokeWidth={2} />
              已锁定 · 工作流生成中
            </span>
          )}
        </div>

        {/* Edit toggle */}
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            Plan Steps · {plan.nodes.length}
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={() => setIsEditing((v) => !v)}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-semibold transition-colors',
                isEditing
                  ? 'bg-ink text-canvas hover:bg-[#2a241d]'
                  : 'bg-canvas-soft text-ink-soft ring-1 ring-hairline hover:bg-surface-subtle',
              )}
            >
              {isEditing ? (
                <>
                  <X className="h-3 w-3" strokeWidth={2} />
                  结束编辑
                </>
              ) : (
                <>
                  <Pencil className="h-3 w-3" strokeWidth={2} />
                  编辑计划
                </>
              )}
            </button>
          )}
        </div>

        {/* Plan node list */}
        <div className="flex flex-col gap-2">
          {plan.nodes.map((node) => (
            <div
              key={node.order}
              className="flex items-start gap-3 rounded-[12px] border border-hairline bg-surface px-3 py-2.5"
            >
              <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-brand-500 text-[10px] font-bold text-white">
                {node.order}
              </span>
              <div className="min-w-0 flex-1">
                {isEditing && canEdit ? (
                  <>
                    <input
                      type="text"
                      value={node.title}
                      onChange={(e) =>
                        updatePlanNode(node.order, { title: e.target.value })
                      }
                      className="h-7 w-full rounded-[8px] border border-hairline bg-canvas px-2 text-[13px] font-semibold text-ink focus:border-brand-500 focus:outline-none"
                    />
                    <textarea
                      value={node.description}
                      rows={2}
                      onChange={(e) =>
                        updatePlanNode(node.order, { description: e.target.value })
                      }
                      className="mt-1 w-full resize-none rounded-[8px] border border-hairline bg-canvas px-2 py-1 text-[11.5px] text-ink-soft focus:border-brand-500 focus:outline-none"
                    />
                  </>
                ) : (
                  <>
                    <p className="text-[13px] font-semibold text-ink">{node.title}</p>
                    <p className="mt-0.5 text-[11.5px] leading-[1.55] text-ink-muted">
                      {node.description}
                    </p>
                  </>
                )}
              </div>
              <span className="flex-shrink-0 rounded-md bg-canvas-soft px-2 py-0.5 text-[10px] font-semibold text-ink-soft">
                {node.recommended_ai}
              </span>
            </div>
          ))}
        </div>

        <p className="text-[12px] text-ink-muted">{plan.confirmation_prompt}</p>

        {/* Start workflow generation */}
        <button
          type="button"
          onClick={handleStart}
          disabled={planLocked}
          className={cn(
            'mt-1 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[12px] text-[13.5px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
            planLocked
              ? 'cursor-not-allowed bg-success-500 text-white'
              : 'bg-[#1c1917] text-white hover:bg-[#2a2724] active:scale-[0.99]',
          )}
        >
          {planLocked ? (
            <>
              <CheckCircle2 className="h-4 w-4" strokeWidth={2.2} />
              工作流已开始生成
            </>
          ) : (
            <>
              <PlayCircle className="h-4 w-4" strokeWidth={2.2} />
              开始生成工作流
            </>
          )}
        </button>
        {!planLocked && (
          <p className="text-center text-[10.5px] text-ink-muted">
            点击「开始生成工作流」后将不可再修改计划
          </p>
        )}
      </div>
    </>
  );
}
