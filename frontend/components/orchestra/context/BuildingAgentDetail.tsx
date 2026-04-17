'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Settings, Terminal, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContextPanelNav } from '../ContextPanel';
import { BUILDING_AGENTS } from './BuildingProcessList';
import { DetailHeader } from './DetailHeader';

type ApprovalItem = {
  id: string;
  icon: 'terminal' | 'settings';
  title: string;
  detail: string;
};

const LOG_LINES_BY_AGENT: Record<string, string[]> = {
  'claude-4-6': [
    'Scanning project root...',
    'Found package.json — valid Node project',
    'Queuing npm install tasks...',
  ],
  deepseek: [
    'Loading design tokens...',
    'Generating component tree (WeatherHero, ForecastCard)...',
    'Wiring Tailwind classes from token map...',
  ],
};

const APPROVALS_BY_AGENT: Record<string, ApprovalItem[]> = {
  'claude-4-6': [
    {
      id: 'install-deps',
      icon: 'terminal',
      title: 'Install 3D rendering dependencies.',
      detail: 'npm install three @react-three/fiber @react-three/drei',
    },
    {
      id: 'env-file',
      icon: 'settings',
      title: 'Set up environment variables file.',
      detail: 'Create .env with OPENWEATHER_API_KEY placeholder',
    },
  ],
  deepseek: [
    {
      id: 'extract-components',
      icon: 'settings',
      title: 'Extract shared Forecast component.',
      detail: 'Create components/weather/ForecastCard.tsx',
    },
  ],
};

const TONE = {
  orange: { card: 'border-[#fde68a] bg-warning-50/30', avatar: 'bg-[#c2410c]' },
  teal: { card: 'border-[#99d6cc] bg-[#f0faf7]', avatar: 'bg-[#0f766e]' },
} as const;

export function BuildingAgentDetail({ nav, agentId }: { nav: ContextPanelNav; agentId: string }) {
  const agent = BUILDING_AGENTS.find((a) => a.id === agentId) ?? BUILDING_AGENTS[0];
  const tone = TONE[agent.tone];
  const logLines = LOG_LINES_BY_AGENT[agent.id] ?? [];
  const [approvals, setApprovals] = useState<ApprovalItem[]>(
    APPROVALS_BY_AGENT[agent.id] ?? []
  );

  const resolveApproval = (id: string) =>
    setApprovals((prev) => prev.filter((a) => a.id !== id));

  return (
    <>
      <DetailHeader
        title={`${agent.name} — Process`}
        onBack={() => nav.goBack({ name: 'building' })}
      />
      <div className="flex flex-col gap-5 px-5 py-5">
        <div className={cn('rounded-[14px] border p-4', tone.card)}>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'grid h-11 w-11 flex-shrink-0 place-items-center rounded-[12px] text-[14px] font-semibold text-white',
                tone.avatar
              )}
            >
              {agent.name.charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-ink">
                {agent.name} <span className="text-ink-muted">·</span>{' '}
                <span className="font-medium text-ink-soft">{agent.subrole}</span>
              </p>
              <p className="text-[12px] text-ink-muted">{agent.task}</p>
            </div>
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full bg-warning-500 animate-pulse"
              aria-hidden
            />
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11.5px] text-ink-muted">
              <span>Task progress</span>
              <span className="font-semibold text-ink-soft">{agent.progress}%</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-canvas-soft">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
                initial={{ width: 0 }}
                animate={{ width: `${agent.progress}%` }}
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
          {logLines.map((line, i) => (
            <div key={i}>
              <span className="text-[#86efac]/60">$ </span>
              {line}
            </div>
          ))}
          <div>
            <span className="text-[#86efac]/60">$ </span>
            <span
              className="inline-block h-[1em] w-2 animate-pulse bg-[#86efac] align-middle"
              aria-hidden
            />
          </div>
        </div>

        {approvals.length > 0 && (
          <>
            <SectionLabel>Pending Approvals</SectionLabel>
            <div className="flex flex-col gap-3">
              {approvals.map((a) => (
                <ApprovalCard
                  key={a.id}
                  item={a}
                  onResolve={() => resolveApproval(a.id)}
                />
              ))}
            </div>
          </>
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

function ApprovalCard({
  item,
  onResolve,
}: {
  item: ApprovalItem;
  onResolve: () => void;
}) {
  const Icon = item.icon === 'terminal' ? Terminal : Settings;
  return (
    <div className="rounded-[14px] border border-[#fde68a] bg-warning-50/40 p-4">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#d97706]" strokeWidth={1.8} />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-ink">{item.title}</p>
          <p className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12px] text-ink-muted">
            {item.detail}
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onResolve}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-gradient-to-b from-success-400 to-success-500 text-[12.5px] font-semibold text-white hover:from-success-500 hover:to-success-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success-500"
        >
          <CheckCircle2 className="h-4 w-4" strokeWidth={2.2} />
          Approve
        </button>
        <button
          type="button"
          onClick={onResolve}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-surface text-[12.5px] font-semibold text-ink ring-1 ring-hairline hover:bg-canvas-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <XCircle className="h-4 w-4" strokeWidth={1.8} />
          Deny
        </button>
      </div>
    </div>
  );
}
