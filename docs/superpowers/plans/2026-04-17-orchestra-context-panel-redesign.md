# Orchestra Context Panel Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tabbed Project Context panel in `/orchestra` with a stack-based navigation model (overview → panel → per-agent detail), and move Undo/Redo out of the chat composer into a new History timeline.

**Architecture:** `ContextPanel.tsx` becomes a shell that renders one view at a time using a local `view` state + framer-motion `AnimatePresence` slide transitions. Seven view components live under `components/orchestra/context/`, each self-contained with inline mock data for Phase 2. A shared `DetailHeader` renders the back-arrow header.

**Tech Stack:** Next.js 15 + React 19, Tailwind v4 (tokens in `frontend/app/globals.css`), framer-motion, lucide-react, TypeScript. No test framework installed — verification is `npm run lint`, `next dev` visual QA against mockups, and `next build` for type-check.

**Spec:** `docs/superpowers/specs/2026-04-17-orchestra-context-panel-redesign-design.md`

**Repo note:** Project is **not** a git repository. "Checkpoint" steps are pause-and-visually-verify; translate to git commits if you `git init` before executing.

**Execution order rationale:** Build the shared `DetailHeader` first (all detail views depend on it). Then refactor `ContextPanel` to a shell that routes views, starting with an Overview stub, so the skeleton is visible end-to-end before each panel is filled in. Then each view in order. `ChatThread` undo removal is independent and placed last so it doesn't block visual QA of the new panels.

---

## Task 1: Create `DetailHeader` shared component

**Files:**
- Create: `frontend/components/orchestra/context/DetailHeader.tsx`

- [ ] **Step 1: Create the directory and component file**

Create directory `frontend/components/orchestra/context/` and file `DetailHeader.tsx` with this exact content:

```tsx
'use client';

import { ArrowLeft } from 'lucide-react';

type DetailHeaderProps = {
  title: string;
  onBack: () => void;
};

export function DetailHeader({ title, onBack }: DetailHeaderProps) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-hairline bg-canvas px-5 pb-4 pt-5">
      <button
        type="button"
        aria-label="Back"
        onClick={onBack}
        className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-surface ring-1 ring-hairline transition-colors hover:bg-canvas-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      >
        <ArrowLeft className="h-4 w-4 text-ink" strokeWidth={1.8} />
      </button>
      <p className="text-[17px] font-semibold text-ink">{title}</p>
    </div>
  );
}
```

- [ ] **Step 2: Lint check**

Run: `cd frontend && npm run lint`
Expected: no errors for the new file (pre-existing warnings are fine).

- [ ] **Step 3: Checkpoint**

Nothing to visually verify yet — the component isn't wired. Continue to Task 2.

---

## Task 2: Refactor `ContextPanel` shell with view-stack routing

**Files:**
- Modify: `frontend/components/orchestra/ContextPanel.tsx` (full rewrite)
- Create temporary stub: inline `OverviewStub` for this task only; Task 3 replaces it with the real `OverviewList`.

- [ ] **Step 1: Replace `ContextPanel.tsx` with the new shell**

Overwrite `frontend/components/orchestra/ContextPanel.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

type View =
  | { name: 'overview' }
  | { name: 'clarifications' }
  | { name: 'clarification-agent'; agentId: string }
  | { name: 'building' }
  | { name: 'building-agent'; agentId: string }
  | { name: 'reports' }
  | { name: 'history' };

export type ContextPanelNav = {
  goTo: (next: View) => void;
  goBack: (to: View) => void;
};

export function ContextPanel() {
  const [view, setView] = useState<View>({ name: 'overview' });
  const [direction, setDirection] = useState<1 | -1>(1);

  const nav: ContextPanelNav = {
    goTo: (next) => {
      setDirection(1);
      setView(next);
    },
    goBack: (to) => {
      setDirection(-1);
      setView(to);
    },
  };

  return (
    <div className="flex h-full flex-col border-l border-hairline bg-canvas">
      {view.name === 'overview' && (
        <div className="border-b border-hairline px-5 pb-4 pt-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            Project Context
          </p>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={viewKey(view)}
            custom={direction}
            variants={slideVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="px-5 py-5"
          >
            {renderView(view, nav)}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function viewKey(view: View): string {
  if (view.name === 'clarification-agent') return `clarification-agent:${view.agentId}`;
  if (view.name === 'building-agent') return `building-agent:${view.agentId}`;
  return view.name;
}

const slideVariants = {
  initial: (dir: 1 | -1) => ({ x: 20 * dir, opacity: 0 }),
  animate: { x: 0, opacity: 1 },
  exit: (dir: 1 | -1) => ({ x: -20 * dir, opacity: 0 }),
};

function renderView(view: View, nav: ContextPanelNav) {
  switch (view.name) {
    case 'overview':
      return <OverviewStub nav={nav} />;
    default:
      return (
        <div className="text-[13px] text-ink-muted">
          View &quot;{view.name}&quot; coming in a later task.
        </div>
      );
  }
}

function OverviewStub({ nav }: { nav: ContextPanelNav }) {
  const items: { label: string; view: View }[] = [
    { label: 'Clarifications', view: { name: 'clarifications' } },
    { label: 'Building Process', view: { name: 'building' } },
    { label: 'Agent Reports', view: { name: 'reports' } },
    { label: 'History', view: { name: 'history' } },
  ];
  return (
    <div className="flex flex-col gap-3">
      {items.map((i) => (
        <button
          key={i.label}
          type="button"
          onClick={() => nav.goTo(i.view)}
          className="rounded-[14px] border border-hairline bg-surface p-4 text-left text-[14px] font-semibold text-ink hover:shadow-[0_4px_20px_-12px_rgba(28,25,23,0.15)]"
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Lint check**

Run: `cd frontend && npm run lint`
Expected: no errors for `ContextPanel.tsx`.

- [ ] **Step 3: Dev-server visual check**

Run: `cd frontend && npm run dev` (or if already running, reload `http://localhost:3000/orchestra`).
Expected:
- Right panel shows "PROJECT CONTEXT" eyebrow + 4 plain stub cards
- Clicking any card slides the view to the right; you should see a placeholder string
- No "back" functionality yet (added via DetailHeader in each view task)
- Browser console: no errors

If the page doesn't update after save, hard-refresh. Keep dev server running for subsequent tasks.

- [ ] **Step 4: Checkpoint**

Before moving on, you should be able to navigate into each placeholder and see slide-right animation. If animation doesn't fire, inspect `motion.div` — the `key` prop changing is what triggers AnimatePresence.

---

## Task 3: Implement `OverviewList` (4 drill-in cards)

**Files:**
- Create: `frontend/components/orchestra/context/OverviewList.tsx`
- Modify: `frontend/components/orchestra/ContextPanel.tsx:renderView` switch

- [ ] **Step 1: Create `OverviewList.tsx`**

Create `frontend/components/orchestra/context/OverviewList.tsx`:

```tsx
'use client';

import { Boxes, ChevronRight, FileCode2, History, Settings2 } from 'lucide-react';
import type { ComponentType } from 'react';
import { cn } from '@/lib/utils';
import type { ContextPanelNav } from '../ContextPanel';

type Card = {
  key: 'clarifications' | 'building' | 'reports' | 'history';
  title: string;
  subtitle: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  iconTile: string;
  cardBorder: string;
  badge?: { kind: 'count'; value: number } | { kind: 'live' };
  onClick: () => void;
};

export function OverviewList({ nav }: { nav: ContextPanelNav }) {
  const cards: Card[] = [
    {
      key: 'clarifications',
      title: 'Clarifications',
      subtitle: '2 Agents awaiting decisions',
      icon: Boxes,
      iconTile: 'bg-[#fde2ec] text-[#e11d74]',
      cardBorder: 'border-[#f5c6d9]',
      badge: { kind: 'count', value: 2 },
      onClick: () => nav.goTo({ name: 'clarifications' }),
    },
    {
      key: 'building',
      title: 'Building Process',
      subtitle: '2 Agents running in parallel',
      icon: Settings2,
      iconTile: 'bg-warning-50 text-warning-500',
      cardBorder: 'border-warning-200',
      badge: { kind: 'live' },
      onClick: () => nav.goTo({ name: 'building' }),
    },
    {
      key: 'reports',
      title: 'Agent Reports',
      subtitle: '2 New Updates',
      icon: FileCode2,
      iconTile: 'bg-canvas-soft text-ink-soft',
      cardBorder: 'border-hairline',
      onClick: () => nav.goTo({ name: 'reports' }),
    },
    {
      key: 'history',
      title: 'History',
      subtitle: 'View & undo past actions',
      icon: History,
      iconTile: 'bg-canvas-soft text-ink-soft',
      cardBorder: 'border-hairline',
      onClick: () => nav.goTo({ name: 'history' }),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <button
            key={c.key}
            type="button"
            onClick={c.onClick}
            className={cn(
              'flex w-full items-center gap-4 rounded-[16px] border bg-surface p-4 text-left transition-shadow',
              'hover:shadow-[0_4px_20px_-12px_rgba(28,25,23,0.15)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
              c.cardBorder
            )}
          >
            <span
              className={cn(
                'grid h-11 w-11 flex-shrink-0 place-items-center rounded-[12px]',
                c.iconTile
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15.5px] font-semibold text-ink">{c.title}</p>
              <p className="mt-0.5 text-[12px] text-ink-muted">{c.subtitle}</p>
            </div>
            {c.badge?.kind === 'count' && (
              <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-[#fde2ec] px-2 text-[12px] font-bold text-[#e11d74]">
                {c.badge.value}
              </span>
            )}
            {c.badge?.kind === 'live' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-warning-600">
                <span className="h-1.5 w-1.5 rounded-full bg-warning-500" aria-hidden />
                Live
              </span>
            )}
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-muted" strokeWidth={1.8} />
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Wire `OverviewList` into the shell**

Open `frontend/components/orchestra/ContextPanel.tsx` and make two changes:

1. Add the import near the top:

```tsx
import { OverviewList } from './context/OverviewList';
```

2. Delete the entire `function OverviewStub(...)` block at the bottom of the file.

3. In `renderView`, replace the `'overview'` case:

```tsx
case 'overview':
  return <OverviewList nav={nav} />;
```

- [ ] **Step 3: Lint + visual check**

Run: `cd frontend && npm run lint`
Then reload `/orchestra` in the browser.

Expected: 4 cards match mockup #9 — pink Clarifications with "2" pill, amber Building Process with "● Live" chip, two neutral cards. Chevron visible on the right of each. Hover raises a subtle shadow. Clicking drills into the placeholder for the respective view.

- [ ] **Step 4: Checkpoint**

Compare pixel-by-pixel against mockup #9. Adjust spacing, font size, or colors only if clearly off. Do not touch tokens in `globals.css` without design sign-off.

---

## Task 4: Implement `ClarificationsList` (per-agent list)

**Files:**
- Create: `frontend/components/orchestra/context/ClarificationsList.tsx`
- Modify: `frontend/components/orchestra/ContextPanel.tsx` (import + switch case)

- [ ] **Step 1: Create `ClarificationsList.tsx`**

Create `frontend/components/orchestra/context/ClarificationsList.tsx`:

```tsx
'use client';

import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContextPanelNav } from '../ContextPanel';
import { DetailHeader } from './DetailHeader';

export type ClarificationAgent = {
  id: string;
  name: string;
  role: string;
  tone: 'green' | 'orange';
  task: string;
  pending: number;
};

export const CLARIFICATION_AGENTS: ClarificationAgent[] = [
  {
    id: 'gpt-5-4',
    name: 'GPT-5.4',
    role: 'Strategist',
    tone: 'green',
    task: 'Weather API & Deployment Strategy',
    pending: 1,
  },
  {
    id: 'claude-4-6',
    name: 'Claude-4.6',
    role: 'Architect',
    tone: 'orange',
    task: '3D Rendering Engine Selection',
    pending: 1,
  },
];

const TONE = {
  green: {
    card: 'border-[#8cc7a8] bg-[#f4faf6]',
    avatar: 'bg-[#2f855a]',
  },
  orange: {
    card: 'border-warning-200 bg-warning-50/40',
    avatar: 'bg-[#c2410c]',
  },
} as const;

export function ClarificationsList({ nav }: { nav: ContextPanelNav }) {
  return (
    <>
      <DetailHeader title="Clarifications" onBack={() => nav.goBack({ name: 'overview' })} />
      <div className="px-5 py-5">
        <p className="mb-4 text-[12.5px] leading-[1.55] text-ink-muted">
          Two agents are working in parallel and need your input before continuing.
        </p>
        <div className="flex flex-col gap-3">
          {CLARIFICATION_AGENTS.map((a) => {
            const tone = TONE[a.tone];
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => nav.goTo({ name: 'clarification-agent', agentId: a.id })}
                className={cn(
                  'group flex w-full flex-col gap-3 rounded-[14px] border p-4 text-left transition-shadow',
                  'hover:shadow-[0_4px_20px_-12px_rgba(28,25,23,0.15)]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                  tone.card
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'grid h-11 w-11 flex-shrink-0 place-items-center rounded-[12px] text-[14px] font-semibold text-white',
                      tone.avatar
                    )}
                  >
                    {a.name.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[15px] font-semibold text-ink">{a.name}</p>
                      <span className="inline-flex items-center rounded-md bg-canvas-soft px-2 py-0.5 text-[11px] text-ink-soft">
                        {a.role}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-ink-muted">{a.task}</p>
                  </div>
                  <ChevronRight
                    className="mt-1.5 h-4 w-4 flex-shrink-0 text-ink-muted"
                    strokeWidth={1.8}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] text-ink-muted">Pending decisions</span>
                  <span className="inline-flex items-center rounded-full bg-[#fde2ec] px-2.5 py-1 text-[11.5px] font-semibold text-[#e11d74]">
                    {a.pending} awaiting
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
```

Note: because `DetailHeader` is `sticky top-0` and the wrapping `motion.div` in `ContextPanel` has `px-5 py-5`, the list view contains its own `px-5 py-5` wrapper and overrides outer padding. To make this work cleanly, the `motion.div` in the shell must drop its padding for non-overview views — handled in Step 2.

- [ ] **Step 2: Remove the outer `motion.div` padding so detail views can control their own layout**

Open `frontend/components/orchestra/ContextPanel.tsx`. Find the line:

```tsx
            className="px-5 py-5"
```

Replace with:

```tsx
            className={view.name === 'overview' ? 'px-5 py-5' : ''}
```

- [ ] **Step 3: Wire `ClarificationsList` into the shell**

In `ContextPanel.tsx`, add the import:

```tsx
import { ClarificationsList } from './context/ClarificationsList';
```

Replace the `clarifications` case in `renderView`:

```tsx
case 'clarifications':
  return <ClarificationsList nav={nav} />;
```

- [ ] **Step 4: Lint + visual check**

Run: `cd frontend && npm run lint`
Reload `/orchestra`, click the Clarifications card.

Expected: slides to a view with a back button + "Clarifications" title, description line, 2 tinted agent cards (green GPT-5.4 + orange Claude-4.6) matching mockup #10. Back button returns to overview with slide-left animation.

- [ ] **Step 5: Checkpoint**

Verify pill color is pink, role chip is neutral, chevron aligns with card top area, overview still renders correctly (padding on overview only).

---

## Task 5: Implement `ClarificationDetail` (per-agent decisions)

**Files:**
- Create: `frontend/components/orchestra/context/ClarificationDetail.tsx`
- Modify: `frontend/components/orchestra/ContextPanel.tsx` (import + switch case)

- [ ] **Step 1: Create `ClarificationDetail.tsx`**

Create `frontend/components/orchestra/context/ClarificationDetail.tsx`:

```tsx
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
        { id: 'three', label: 'Three.js + R3F', meta: 'Familiar React bindings, strong ecosystem.', recommended: true },
        { id: 'babylon', label: 'Babylon.js', meta: 'Built-in physics and particle systems.' },
      ],
    },
  ],
};

const TONE = {
  green: { card: 'border-[#8cc7a8] bg-[#f4faf6]', avatar: 'bg-[#2f855a]' },
  orange: { card: 'border-warning-200 bg-warning-50/40', avatar: 'bg-[#c2410c]' },
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
          className="mt-1 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[12px] bg-[#1c1917] text-[13px] font-semibold text-white hover:bg-[#2a2724] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
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
                    ? 'border-warning-300 bg-warning-50/60'
                    : 'border-hairline bg-canvas hover:border-warning-300'
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
```

- [ ] **Step 2: Wire into shell**

In `frontend/components/orchestra/ContextPanel.tsx`, add import:

```tsx
import { ClarificationDetail } from './context/ClarificationDetail';
```

Replace the `clarification-agent` case in `renderView`:

```tsx
case 'clarification-agent':
  return <ClarificationDetail nav={nav} agentId={view.agentId} />;
```

- [ ] **Step 3: Lint + visual check**

Run: `cd frontend && npm run lint`
Reload `/orchestra`, click Clarifications card → click GPT-5.4 card.

Expected: matches mockup #11 — agent summary card at top (green tint), Weather API Provider card with 3 radio options, OpenWeather API selected with orange ring + dot, black "Confirm Selection" button. Clicking other radios updates the selection. Clicking back returns to clarifications list. Clicking Claude-4.6 from the list shows its own 3D Rendering Engine decision card.

- [ ] **Step 4: Checkpoint**

Verify Confirm Selection button text contrast, radio alignment, tint match. Acceptable if Claude detail content is a shorter variation — the exact per-agent decision set is mock anyway.

---

## Task 6: Implement `BuildingProcessList` (per-agent progress)

**Files:**
- Create: `frontend/components/orchestra/context/BuildingProcessList.tsx`
- Modify: `frontend/components/orchestra/ContextPanel.tsx` (import + switch case)

- [ ] **Step 1: Create `BuildingProcessList.tsx`**

Create `frontend/components/orchestra/context/BuildingProcessList.tsx`:

```tsx
'use client';

import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContextPanelNav } from '../ContextPanel';
import { DetailHeader } from './DetailHeader';

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

export const BUILDING_AGENTS: BuildingAgent[] = [
  {
    id: 'claude-4-6',
    name: 'Claude-4.6',
    tone: 'orange',
    task: 'Environment & Deployment Config',
    status: 'waiting',
    progress: 40,
    approvals: 2,
    subrole: 'Env Configurator',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    tone: 'teal',
    task: 'Component Architecture & UI',
    status: 'running',
    progress: 65,
    approvals: 1,
    subrole: 'Component Engineer',
  },
];

const TONE = {
  orange: { card: 'border-warning-200 bg-warning-50/30', avatar: 'bg-[#c2410c]' },
  teal: { card: 'border-[#99d6cc] bg-[#f0faf7]', avatar: 'bg-[#0f766e]' },
} as const;

export function BuildingProcessList({ nav }: { nav: ContextPanelNav }) {
  return (
    <>
      <DetailHeader title="Building Process" onBack={() => nav.goBack({ name: 'overview' })} />
      <div className="px-5 py-5">
        <p className="mb-4 text-[12.5px] leading-[1.55] text-ink-muted">
          These agents are executing tasks in parallel. Some require your approval to proceed.
        </p>
        <div className="flex flex-col gap-3">
          {BUILDING_AGENTS.map((a) => {
            const tone = TONE[a.tone];
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => nav.goTo({ name: 'building-agent', agentId: a.id })}
                className={cn(
                  'flex w-full flex-col gap-3 rounded-[14px] border p-4 text-left transition-shadow hover:shadow-[0_4px_20px_-12px_rgba(28,25,23,0.15)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                  tone.card
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'grid h-11 w-11 flex-shrink-0 place-items-center rounded-[12px] text-[14px] font-semibold text-white',
                      tone.avatar
                    )}
                  >
                    {a.name.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[15px] font-semibold text-ink">{a.name}</p>
                      <StatusChip status={a.status} />
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-ink-muted">{a.task}</p>
                  </div>
                  <ChevronRight
                    className="mt-1.5 h-4 w-4 flex-shrink-0 text-ink-muted"
                    strokeWidth={1.8}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11.5px] text-ink-muted">
                    <span>Progress</span>
                    <span className="font-semibold text-ink-soft">{a.progress}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-canvas-soft">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
                      initial={{ width: 0 }}
                      animate={{ width: `${a.progress}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <span className="inline-flex items-center rounded-full bg-[#fde2ec] px-2.5 py-1 text-[11.5px] font-semibold text-[#e11d74]">
                    {a.approvals} approval needed
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function StatusChip({ status }: { status: 'waiting' | 'running' }) {
  if (status === 'waiting') {
    return (
      <span className="inline-flex items-center rounded-md bg-warning-50 px-2 py-0.5 text-[11px] font-semibold text-warning-600">
        Waiting
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-warning-50 px-2 py-0.5 text-[11px] font-semibold text-warning-600">
      <span className="h-1.5 w-1.5 rounded-full bg-warning-500 animate-pulse" aria-hidden />
      Running
    </span>
  );
}
```

- [ ] **Step 2: Wire into shell**

In `frontend/components/orchestra/ContextPanel.tsx`, add import:

```tsx
import { BuildingProcessList } from './context/BuildingProcessList';
```

Replace the `building` case in `renderView`:

```tsx
case 'building':
  return <BuildingProcessList nav={nav} />;
```

- [ ] **Step 3: Lint + visual check**

Run: `cd frontend && npm run lint`
Reload, click Building Process.

Expected: mockup #12 — back button + title, description, 2 cards (orange Claude waiting 40%, teal DeepSeek running 65% with pulse dot), progress bars animated from 0, "N approval needed" pink pill on the right.

- [ ] **Step 4: Checkpoint**

Confirm pulse dot on "Running" but not on "Waiting". Gradient bar is orange. Clicking card drills to placeholder (Task 7 fills it in).

---

## Task 7: Implement `BuildingAgentDetail` (activity log + approvals)

**Files:**
- Create: `frontend/components/orchestra/context/BuildingAgentDetail.tsx`
- Modify: `frontend/components/orchestra/ContextPanel.tsx` (import + switch case)

- [ ] **Step 1: Create `BuildingAgentDetail.tsx`**

Create `frontend/components/orchestra/context/BuildingAgentDetail.tsx`:

```tsx
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
  orange: { card: 'border-warning-200 bg-warning-50/30', avatar: 'bg-[#c2410c]' },
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
    <div className="rounded-[14px] border border-warning-200 bg-warning-50/40 p-4">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning-600" strokeWidth={1.8} />
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
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-gradient-to-b from-success-400 to-success-500 text-[12.5px] font-semibold text-white hover:from-success-500 hover:to-success-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          <CheckCircle2 className="h-4 w-4" strokeWidth={2.2} />
          Approve
        </button>
        <button
          type="button"
          onClick={onResolve}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-surface text-[12.5px] font-semibold text-ink ring-1 ring-hairline hover:bg-canvas-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          <XCircle className="h-4 w-4" strokeWidth={1.8} />
          Deny
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into shell**

In `frontend/components/orchestra/ContextPanel.tsx`, add import:

```tsx
import { BuildingAgentDetail } from './context/BuildingAgentDetail';
```

Replace the `building-agent` case in `renderView`:

```tsx
case 'building-agent':
  return <BuildingAgentDetail nav={nav} agentId={view.agentId} />;
```

- [ ] **Step 3: Lint + visual check**

Run: `cd frontend && npm run lint`
Reload, navigate Building Process → Claude-4.6.

Expected: mockup #13 — agent summary card with progress, ACTIVITY LOG section with dark terminal panel (3 `$`-prefixed lines + blinking cursor line), PENDING APPROVALS section with 2 amber-tinted approval cards (green Approve / white Deny). Clicking Approve or Deny removes the card.

- [ ] **Step 4: Checkpoint**

Verify cursor blink animation is visible. Font is mono inside terminal. Both approvals can be cleared; when empty, PENDING APPROVALS section disappears entirely.

---

## Task 8: Implement `AgentReports` (reuse existing list in new shell)

**Files:**
- Create: `frontend/components/orchestra/context/AgentReports.tsx`
- Modify: `frontend/components/orchestra/ContextPanel.tsx` (import + switch case)

- [ ] **Step 1: Create `AgentReports.tsx`**

Create `frontend/components/orchestra/context/AgentReports.tsx`:

```tsx
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
```

- [ ] **Step 2: Wire into shell**

In `frontend/components/orchestra/ContextPanel.tsx`, add import:

```tsx
import { AgentReports } from './context/AgentReports';
```

Replace the `reports` case:

```tsx
case 'reports':
  return <AgentReports nav={nav} />;
```

- [ ] **Step 3: Lint + visual check**

Run: `cd frontend && npm run lint`
Reload, navigate Overview → Agent Reports.

Expected: back button + title + description + 3 report cards, same content as before the refactor.

- [ ] **Step 4: Checkpoint**

Verify time and author still show. No behavior change.

---

## Task 9: Implement `HistoryTimeline` with per-entry Undo/Redo

**Files:**
- Create: `frontend/components/orchestra/context/HistoryTimeline.tsx`
- Modify: `frontend/components/orchestra/ContextPanel.tsx` (import + switch case)

- [ ] **Step 1: Create `HistoryTimeline.tsx`**

Create `frontend/components/orchestra/context/HistoryTimeline.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { RotateCcw, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContextPanelNav } from '../ContextPanel';
import { DetailHeader } from './DetailHeader';

type HistoryEntry = {
  id: string;
  label: string;
  meta: string;
  time: string;
  reversible: boolean;
  undone: boolean;
};

const SEED: HistoryEntry[] = [
  {
    id: 'h1',
    label: 'API Provider Selected',
    meta: 'OpenWeather API approved by user.',
    time: '10:44 AM',
    reversible: true,
    undone: false,
  },
  {
    id: 'h2',
    label: 'Vercel Deployment Confirmed',
    meta: 'User selected Vercel as deployment target.',
    time: '10:43 AM',
    reversible: true,
    undone: false,
  },
  {
    id: 'h3',
    label: 'Workflow Generated',
    meta: 'Created 6 nodes based on requirements.',
    time: '10:42 AM',
    reversible: true,
    undone: false,
  },
  {
    id: 'h4',
    label: 'Project Initiated',
    meta: 'Started by YiKai.',
    time: '10:41 AM',
    reversible: false,
    undone: false,
  },
];

export function HistoryTimeline({ nav }: { nav: ContextPanelNav }) {
  const [entries, setEntries] = useState<HistoryEntry[]>(SEED);

  const toggle = (id: string) =>
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, undone: !e.undone } : e))
    );

  // The "current" marker (green dot) is the first reversible, not-undone entry.
  const currentId = entries.find((e) => e.reversible && !e.undone)?.id;

  return (
    <>
      <DetailHeader title="History" onBack={() => nav.goBack({ name: 'overview' })} />
      <div className="px-5 py-5">
        <p className="mb-5 text-[12.5px] leading-[1.55] text-ink-muted">
          All actions taken in this session. You can undo reversible actions.
        </p>
        <div className="relative pl-7">
          <span
            className="absolute left-[11px] top-2 bottom-2 w-px bg-hairline"
            aria-hidden
          />
          <ol className="flex flex-col">
            {entries.map((e) => (
              <li key={e.id} className="relative pb-4 last:pb-0">
                <HistoryDot state={e.undone ? 'undone' : e.id === currentId ? 'current' : 'done'} />
                <HistoryCard entry={e} onToggle={() => toggle(e.id)} />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </>
  );
}

function HistoryDot({ state }: { state: 'current' | 'done' | 'undone' }) {
  if (state === 'current') {
    return (
      <span
        className="absolute -left-7 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-success-100 ring-2 ring-canvas"
        aria-hidden
      >
        <span className="h-2.5 w-2.5 rounded-full bg-success-500" />
      </span>
    );
  }
  if (state === 'undone') {
    return (
      <span
        className="absolute -left-7 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-canvas-soft ring-2 ring-canvas"
        aria-hidden
      >
        <RotateCcw className="h-2.5 w-2.5 text-ink-muted" strokeWidth={2} />
      </span>
    );
  }
  return (
    <span
      className="absolute -left-7 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-canvas-soft ring-2 ring-canvas"
      aria-hidden
    >
      <span className="h-2 w-2 rounded-full bg-ink-muted/40" />
    </span>
  );
}

function HistoryCard({
  entry,
  onToggle,
}: {
  entry: HistoryEntry;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        'ml-2 rounded-[12px] border border-hairline bg-surface p-3 transition-opacity',
        entry.undone && 'opacity-75'
      )}
      aria-label={entry.undone ? `${entry.label} (undone)` : entry.label}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className={cn(
            'text-[13.5px] font-semibold text-ink',
            entry.undone && 'text-ink-muted line-through'
          )}
        >
          {entry.label}
        </p>
        <span className="flex-shrink-0 text-[11px] text-ink-muted">{entry.time}</span>
      </div>
      <p
        className={cn(
          'mt-0.5 text-[12px] text-ink-muted',
          entry.undone && 'line-through'
        )}
      >
        {entry.meta}
      </p>
      {entry.reversible && (
        <div className="mt-2.5">
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-full bg-canvas-soft px-2.5 text-[12px] font-semibold transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
              entry.undone ? 'text-success-600' : 'text-ink-soft'
            )}
          >
            {entry.undone ? (
              <>
                <RotateCw className="h-3.5 w-3.5" strokeWidth={2} />
                Redo
              </>
            ) : (
              <>
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
                Undo
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire into shell**

In `frontend/components/orchestra/ContextPanel.tsx`, add import:

```tsx
import { HistoryTimeline } from './context/HistoryTimeline';
```

Replace the `history` case:

```tsx
case 'history':
  return <HistoryTimeline nav={nav} />;
```

- [ ] **Step 3: Lint + visual check**

Run: `cd frontend && npm run lint`
Reload, navigate Overview → History.

Expected: mockup #14 — back + title + description + timeline rail with 4 entries. Top entry green dot; others gray. Entries 1–3 have Undo button; "Project Initiated" has no button. Click Undo on top → strikethrough + Redo button appears + dot changes to rotate icon (mockup #15). Click Redo → reverts.

- [ ] **Step 4: Checkpoint**

Verify "current" dot correctly updates when the first reversible entry is undone: the second entry becomes the new "current" (green). If not, confirm the `currentId` computation includes the `reversible && !undone` condition.

---

## Task 10: Remove Undo button from `ChatThread`

**Files:**
- Modify: `frontend/components/orchestra/ChatThread.tsx`
- Verify: `frontend/app/(app)/orchestra/page.tsx` passes no undo props

- [ ] **Step 1: Open and inspect `ChatThread.tsx`**

Read the file and locate:
- Props `onUndo?: () => void` and `canUndo?: boolean` (around lines 70–71)
- Prop destructuring listing them (around lines 80–81)
- `const handleUndo = () => { ... onUndo?.(); };` definition (around lines 109–111)
- The `<button>` around lines 140–160 that calls `handleUndo` (visual: `CornerUpLeft` icon + "Undo" text)
- The `CornerUpLeft` import in the `lucide-react` import group (around line 9)

Exact line numbers may drift; use grep to pinpoint: `cd frontend && grep -n -E "onUndo|canUndo|handleUndo|CornerUpLeft" components/orchestra/ChatThread.tsx`

- [ ] **Step 2: Remove each reference**

Apply these deletions in `ChatThread.tsx`:

1. Remove `onUndo?: () => void;` and `canUndo?: boolean;` lines from the props type.
2. Remove `onUndo,` and `canUndo,` from the destructured function parameters.
3. Delete the `const handleUndo = () => { setLocalUndo?.(); onUndo?.(); };` block entirely. (If it references any intermediate local state setter like `setLocalUndo`, delete that state too if it's unused elsewhere.)
4. Delete the Undo `<button>` element (and any surrounding wrapper that existed only to host it). The adjacent composer layout should still render correctly.
5. Remove `CornerUpLeft` from the lucide-react import — if it was the only icon on its import line, delete the line; otherwise remove just that identifier.

- [ ] **Step 3: Audit for remaining references**

Run from the `frontend` directory:

```bash
grep -rn -E "onUndo|canUndo|CornerUpLeft" .
```

Expected: zero hits in `components/`, `app/`, `hooks/`, `stores/`. Hits inside `node_modules/` are fine. If a hit remains outside `node_modules/`, remove it.

- [ ] **Step 4: Verify `orchestra/page.tsx` untouched**

Run: `cd frontend && grep -n -E "onUndo|canUndo" "app/(app)/orchestra/page.tsx"`
Expected: no output.

- [ ] **Step 5: Lint + build + visual check**

Run: `cd frontend && npm run lint && npm run build`
Expected: clean build; any pre-existing warnings are acceptable.

Reload `/orchestra`. Expected: chat composer renders without the Undo button; typing and sending still work; no console errors.

- [ ] **Step 6: Checkpoint**

Confirm the composer layout isn't visually broken (buttons aligned, paperclip still present if it was).

---

## Task 11: Final verification pass

- [ ] **Step 1: Full `next build` type-check**

Run: `cd frontend && npm run build`
Expected: exits with success (Next.js prints page sizes). No TypeScript errors.

- [ ] **Step 2: Walk every view end-to-end in the browser**

On `http://localhost:3000/orchestra`, perform this sequence and check each assertion:

1. Overview loads with 4 cards → ✅ matches mockup #9.
2. Click Clarifications → slides right to list → ✅ matches #10.
3. Click GPT-5.4 → slides right to decisions → ✅ matches #11. Change radio → selection updates. Click Confirm → slides left back to clarifications list.
4. Click back → slides left to overview.
5. Click Building Process → list → ✅ matches #12. Progress bars animate from 0.
6. Click Claude-4.6 → detail → ✅ matches #13. Cursor blinks. Click Approve on first item → card disappears. Click Deny on second → disappears. "Pending Approvals" section is now gone.
7. Back → Back → overview.
8. Click Agent Reports → list of 3 reports.
9. Back → click History → timeline with 4 entries (green top dot). Undo top entry → strikethrough + Redo → dot becomes rotate icon. Second entry dot is now green. Redo top → first entry restores.
10. Chat composer has no Undo button.

- [ ] **Step 3: Accessibility spot-check**

Tab through overview cards; each card receives a visible focus ring. Hit Enter to drill in. Tab to the back button in a detail view — visible ring, Enter returns. Terminal panel has `role="log"`; undone history card label reads "... (undone)" via aria-label.

- [ ] **Step 4: Lint clean**

Run: `cd frontend && npm run lint`
Expected: no new errors attributable to files we touched.

- [ ] **Step 5: Update progress markers**

Per the repo convention (`CLAUDE.md`), update the "Current Progress" block in `CLAUDE.md` to reflect this work:

Open `D:\Workplace\Project-person\OrchestrAI\CLAUDE.md` and under "Current Progress" modify the Phase 3 line to indicate the Orchestra right-panel redesign is done:

```md
- Phase 3: The Orchestra 功能接线（Claude 流式、Undo、4 tabs 实数据、Approval Window）pending — **Right panel redesigned (stack nav + Undo/Redo in History) 2026-04-17**
```

Then add an entry to `D:\AI\Claude\config\projects\D--Workplace-Project-person-OrchestrAI\memory\MEMORY.md` noting this session's completion — a one-line pointer is enough, e.g. append:

```md
- [Orchestra context panel redesign](project_orchestrai.md) — stack-nav overview + Clarifications / Building / Reports / History w/ Undo-Redo done 2026-04-17
```

(Update the existing `project_orchestrai.md` content with the new "redesign done" fact rather than creating a duplicate memory.)

- [ ] **Step 6: Done**

Feature is complete. Leave the dev server running for the user to inspect, or Ctrl-C it.

---

## Out of Scope (Phase 3+)

- Wire Clarifications Confirm → real WebSocket event
- Wire Building Process Approve/Deny → backend agent-command dispatch
- Real activity log streaming from backend
- Real undo stack tied to application state (Zustand + reducer)
- Deep-linking / URL state for the view stack
