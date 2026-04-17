'use client';

import { useState } from 'react';
import { CheckCircle2, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContextPanelNav } from '../ContextPanel';
import { CLARIFICATION_AGENTS } from './ClarificationsList';
import { DetailHeader } from './DetailHeader';

type Option = {
  id: string;
  label: string;
  meta: string;
  recommended?: boolean;
};

type Decision = {
  id: string;
  title: string;
  subtitle: string;
  options: Option[];
};

const DECISIONS_BY_AGENT: Record<string, Decision[]> = {
  'gpt-5-4': [
    {
      id: 'weather-api',
      title: 'Weather API Provider',
      subtitle: 'Select the primary data source for weather information.',
      options: [
        {
          id: 'open',
          label: 'OpenWeather API',
          meta: 'Free tier available, reliable global data.',
          recommended: true,
        },
        {
          id: 'tomorrow',
          label: 'Tomorrow.io',
          meta: 'Hyper-local, excellent for 3D visualization.',
        },
        {
          id: 'weatherbit',
          label: 'WeatherBit',
          meta: 'Cost-effective, broad global coverage.',
        },
      ],
    },
  ],
  'claude-4-6': [
    {
      id: 'render-engine',
      title: '3D Rendering Engine',
      subtitle: 'Pick the rendering stack for the weather scene.',
      options: [
        {
          id: 'three',
          label: 'Three.js + R3F',
          meta: 'Familiar React bindings, strong ecosystem.',
          recommended: true,
        },
        {
          id: 'babylon',
          label: 'Babylon.js',
          meta: 'Built-in physics and particle systems.',
        },
      ],
    },
  ],
};

const TONE = {
  green: { card: 'border-[#8cc7a8] bg-[#f4faf6]', avatar: 'bg-[#2f855a]' },
  orange: { card: 'border-[#fde68a] bg-warning-50/40', avatar: 'bg-[#c2410c]' },
} as const;

export function ClarificationDetail({ nav, agentId }: { nav: ContextPanelNav; agentId: string }) {
  const agent = CLARIFICATION_AGENTS.find((a) => a.id === agentId) ?? CLARIFICATION_AGENTS[0];
  const decisions = DECISIONS_BY_AGENT[agent.id] ?? [];
  const tone = TONE[agent.tone];

  return (
    <>
      <DetailHeader
        title={`${agent.name} — Decisions`}
        onBack={() => nav.goBack({ name: 'clarifications' })}
      />
      <div className="flex flex-col gap-4 px-5 py-5">
        <div className={cn('flex items-center gap-3 rounded-[14px] border p-3', tone.card)}>
          <span
            className={cn(
              'grid h-10 w-10 flex-shrink-0 place-items-center rounded-[10px] text-[13px] font-semibold text-white',
              tone.avatar
            )}
          >
            {agent.name.charAt(0)}
          </span>
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-ink">
              {agent.name} <span className="text-ink-muted">·</span>{' '}
              <span className="font-medium text-ink-soft">{agent.role}</span>
            </p>
            <p className="text-[12px] text-ink-muted">{agent.task}</p>
          </div>
        </div>

        {decisions.map((d) => (
          <DecisionCard key={d.id} decision={d} />
        ))}

        <button
          type="button"
          onClick={() => nav.goBack({ name: 'clarifications' })}
          className="mt-1 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[12px] bg-[#1c1917] text-[13px] font-semibold text-white hover:bg-[#2a2724] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <CheckCircle2 className="h-4 w-4" strokeWidth={2.2} />
          Confirm Selection
        </button>
      </div>
    </>
  );
}

function DecisionCard({ decision }: { decision: Decision }) {
  const [selected, setSelected] = useState<string>(
    decision.options.find((o) => o.recommended)?.id ?? decision.options[0].id
  );
  return (
    <div className="rounded-[14px] border border-hairline bg-surface p-4">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-warning-500" strokeWidth={1.8} />
        <p className="text-[14px] font-semibold text-ink">{decision.title}</p>
      </div>
      <p className="mt-1 text-[12px] text-ink-muted">{decision.subtitle}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {decision.options.map((o) => {
          const active = o.id === selected;
          return (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => setSelected(o.id)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-[12px] border px-3 py-2.5 text-left transition-colors',
                  active
                    ? 'border-[#fcd34d] bg-warning-50/60'
                    : 'border-hairline bg-canvas hover:border-[#fcd34d]'
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-ink">{o.label}</p>
                  <p className="text-[11.5px] text-ink-muted">{o.meta}</p>
                </div>
                <span
                  className={cn(
                    'grid h-4 w-4 flex-shrink-0 place-items-center rounded-full ring-1',
                    active ? 'ring-warning-500' : 'ring-hairline'
                  )}
                >
                  {active && <span className="h-2 w-2 rounded-full bg-warning-500" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
