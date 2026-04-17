'use client';

import type { ContextPanelNav } from '../ContextPanel';
import { DetailHeader } from './DetailHeader';

type Report = {
  author: string;
  title: string;
  summary: string;
  time: string;
};

const REPORTS: Report[] = [
  {
    author: 'Claude 4.5',
    title: 'Scene Architecture Draft',
    summary: '3 layers, 4 lights, 1 post FX pass. Estimated 60fps on M2.',
    time: '10:48',
  },
  {
    author: 'GPT-5',
    title: 'Copy Deck v1',
    summary: 'Hero + 5 feature strings, tone: playful-technical.',
    time: '10:51',
  },
  {
    author: 'DeepSeek',
    title: 'Forecast Schema',
    summary: 'Normalized 5-day schema with hourly resolution.',
    time: '10:54',
  },
];

export function AgentReports({ nav }: { nav: ContextPanelNav }) {
  return (
    <>
      <DetailHeader title="Agent Reports" onBack={() => nav.goBack({ name: 'overview' })} />
      <div className="px-5 py-5">
        <p className="mb-4 text-[12.5px] leading-[1.55] text-ink-muted">
          Latest artifacts from parallel agents.
        </p>
        <ul className="flex flex-col gap-3">
          {REPORTS.map((r) => (
            <li key={r.title} className="rounded-[14px] border border-hairline bg-surface p-4">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold text-ink">{r.title}</p>
                <span className="text-[11px] text-ink-muted">{r.time}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-ink-muted">by {r.author}</p>
              <p className="mt-2 text-[12.5px] leading-[1.5] text-ink-soft">{r.summary}</p>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
