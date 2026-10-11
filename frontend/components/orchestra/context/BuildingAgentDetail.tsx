'use client';

import { motion } from 'framer-motion';
import { Settings, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { decideApproval } from '@/lib/api';
import type { ContextPanelNav } from '../ContextPanel';
import { DetailHeader } from './DetailHeader';
import { useOrchestraStore } from '@/stores/orchestraStore';
import { useWorkflowStore } from '@/stores/workflowStore';

// Stubs kept for backward compat (older imports in Phase 5 code)
export type BuildingAgent = {
  id: string;
  name: string;
  tone: 'orange' | 'teal';
  task: string;
  status: 'waiting' | 'running';
  progress: number;
  approvals: number;
  subrole: string;
};
export const BUILDING_AGENTS: BuildingAgent[] = [];

const AI_LABEL: Record<string, string> = {
  claude: 'Claude-4.6',
  gpt: 'GPT-4o',
  gemini: 'Gemini',
  grok: 'Grok',
};

const AI_TONE: Record<string, { card: string; avatar: string }> = {
  claude: { card: 'border-[#fde68a] bg-warning-50/30', avatar: 'bg-[#c2410c]' },
  gpt: { card: 'border-[#8cc7a8] bg-[#f4faf6]', avatar: 'bg-[#2f855a]' },
  gemini: { card: 'border-[#bde0fe] bg-[#f1f7ff]', avatar: 'bg-[#1d4ed8]' },
  grok: { card: 'border-[#e9d5ff] bg-[#faf5ff]', avatar: 'bg-[#6d28d9]' },
};

export function BuildingAgentDetail({ nav, agentId }: { nav: ContextPanelNav; agentId: string }) {
  const { workflow } = useWorkflowStore();
  const approvals = useOrchestraStore((s) =>
    s.approvals.filter((approval) => !approval.node_id || approval.node_id === agentId),
  );
  const updateApproval = useOrchestraStore((s) => s.updateApproval);
  const node = workflow?.nodes.find((n) => n.node_id === agentId);

  if (!node) {
    return (
      <>
        <DetailHeader title="Agent Process" onBack={() => nav.goBack({ name: 'building' })} />
        <div className="px-5 py-6 text-[12.5px] text-ink-muted">节点未找到。</div>
      </>
    );
  }

  const tone = AI_TONE[node.assigned_ai] ?? AI_TONE.claude;
  const label = AI_LABEL[node.assigned_ai] ?? node.assigned_ai;
  const progress = 0;

  return (
    <>
      <DetailHeader
        title={`${label} — Process`}
        onBack={() => nav.goBack({ name: 'building' })}
      />
      <div className="flex flex-col gap-5 px-5 py-5">
        <div className={cn('rounded-[14px] border p-4', tone.card)}>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'grid h-11 w-11 flex-shrink-0 place-items-center rounded-[12px] text-[14px] font-semibold text-white',
                tone.avatar,
              )}
            >
              {label.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-ink">
                {label} <span className="text-ink-muted">·</span>{' '}
                <span className="font-medium text-ink-soft">{node.assigned_tool || 'Agent'}</span>
              </p>
              <p className="truncate text-[12px] text-ink-muted">{node.title}</p>
            </div>
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-ink-muted" aria-hidden />
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11.5px] text-ink-muted">
              <span>Task progress</span>
              <span className="font-semibold text-ink-soft">{progress}%</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-canvas-soft">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>

        <SectionLabel icon={<Terminal className="h-3.5 w-3.5" strokeWidth={2} />}>
          Activity Log
        </SectionLabel>
        <div
          role="log"
          aria-live="polite"
          className="rounded-[12px] bg-[#1c1917] p-4 font-mono text-[12px] leading-[1.7] text-[#86efac]"
        >
          <div>
            <span className="text-[#86efac]/60">$ </span>
            Execution not started yet — Phase 3 设计完成，执行阶段尚未接入。
          </div>
          <div>
            <span className="text-[#86efac]/60">$ </span>
            Waiting for approval from orchestra to begin...
          </div>
          <div>
            <span className="text-[#86efac]/60">$ </span>
            <span
              className="inline-block h-[1em] w-2 animate-pulse bg-[#86efac] align-middle"
              aria-hidden
            />
          </div>
        </div>

        <SectionLabel>Pending Approvals</SectionLabel>
        {approvals.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-hairline bg-canvas-soft/50 p-4 text-center">
            <Settings className="mx-auto h-5 w-5 text-ink-muted" strokeWidth={1.6} />
            <p className="mt-2 text-[12.5px] font-medium text-ink-soft">暂无待审批项</p>
            <p className="mt-1 text-[11.5px] text-ink-muted">
              节点执行开始后，需要人工决策的操作会显示在这里。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {approvals.map((approval) => (
              <div
                key={approval.approval_id}
                className="rounded-[14px] border border-warning-200 bg-warning-50/40 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-semibold text-ink">
                      {approval.action_type}
                    </p>
                    <p className="mt-1 text-[11.5px] text-ink-muted">
                      Risk: {approval.risk_level} · Status: {approval.status}
                    </p>
                  </div>
                  <span className="rounded-full bg-white/70 px-2 py-1 text-[10.5px] font-semibold uppercase text-warning-700">
                    HITL
                  </span>
                </div>
                <pre className="mt-3 max-h-28 overflow-auto rounded-[10px] bg-white/70 p-2 text-left text-[11px] leading-relaxed text-ink-soft">
                  {JSON.stringify(approval.requested_payload, null, 2)}
                </pre>
                {approval.status === 'pending' ? (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        const updated = await decideApproval(approval.approval_id, 'approve');
                        updateApproval(updated);
                      }}
                      className="rounded-[10px] bg-success-600 px-3 py-2 text-[12px] font-semibold text-white"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const updated = await decideApproval(approval.approval_id, 'deny');
                        updateApproval(updated);
                      }}
                      className="rounded-[10px] border border-hairline bg-white px-3 py-2 text-[12px] font-semibold text-ink-soft"
                    >
                      Deny
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function SectionLabel({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
      {icon}
      {children}
    </p>
  );
}
