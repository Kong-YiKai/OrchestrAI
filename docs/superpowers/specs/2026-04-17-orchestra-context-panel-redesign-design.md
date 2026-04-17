# Orchestra Context Panel Redesign — Design Spec

**Date:** 2026-04-17
**Scope:** `/orchestra` right-hand Project Context panel
**Phase:** Part of Phase 2 (visual alignment with Figma) / setup for Phase 3 functional wiring

---

## 1. Goal

Replace the existing **tab-switching** Project Context panel with a **stack-based navigation** model inspired by the mockups: a 4-card overview drills down into per-panel detail views, some panels drill one level further into per-agent sub-detail views. This makes room for parallel-agent scenarios (Clarifications and Building Process) where the user needs to inspect, approve, or decide per agent.

Also: remove the Undo button from the chat composer (it belongs to history, not conversation) and surface Undo/Redo as per-entry controls inside the History panel.

## 2. Non-Goals

- No backend wiring. All data remains mock/seed for Phase 2.
- No change to the three-column shell (`/orchestra/page.tsx`), Recent Projects panel, or Chat thread except the Undo-button removal.
- No change to panel width (`CONTEXT_PANEL_WIDTH = 360`), background, or outer framing.
- No Zustand store yet — view-stack state is local to `ContextPanel`. Phase 3 may promote if cross-component navigation is needed.

## 3. Architecture Decision — File Layout

Chosen approach: **split into `components/orchestra/context/` sub-directory** (matches project convention of `components/<module>/`).

```
components/orchestra/
├── ContextPanel.tsx                # Shell: header eyebrow (overview only) + AnimatePresence + view router
└── context/                        # NEW directory
    ├── DetailHeader.tsx            # Back button + title, reused by every detail view
    ├── OverviewList.tsx            # 4 drill-in cards
    ├── ClarificationsList.tsx      # Parallel-agent list (decisions awaiting)
    ├── ClarificationDetail.tsx     # Single agent's decision set
    ├── BuildingProcessList.tsx     # Parallel-agent progress list
    ├── BuildingAgentDetail.tsx     # Activity log + pending approvals for one agent
    ├── AgentReports.tsx            # Re-used reports list wrapped in DetailHeader shell
    └── HistoryTimeline.tsx         # Timeline with per-entry Undo/Redo
```

Rejected alternatives:
- **Single file** — would exceed ~700 lines; harder to wire real data per panel later.
- **Generic `<Stack>` abstraction** — YAGNI for 7 views.

## 4. View-Stack State Model

Inside `ContextPanel.tsx`:

```ts
type View =
  | { name: 'overview' }
  | { name: 'clarifications' }
  | { name: 'clarification-agent'; agentId: string }
  | { name: 'building' }
  | { name: 'building-agent'; agentId: string }
  | { name: 'reports' }
  | { name: 'history' };

const [view, setView] = useState<View>({ name: 'overview' });
const [direction, setDirection] = useState<1 | -1>(1);

const goTo = (next: View) => { setDirection(1); setView(next); };
const goBack = (to: View) => { setDirection(-1); setView(to); };
```

- `direction` is passed as `custom` to `AnimatePresence` to steer slide direction.
- `goBack` always takes the target explicitly (no implicit pop) — avoids maintaining a history stack for such a small graph. Back from `clarification-agent` → `clarifications`; back from `clarifications` → `overview`; symmetric for building.

### Navigation graph

```
overview
├── clarifications ──► clarification-agent (per agent)
├── building ──────── ► building-agent (per agent)
├── reports
└── history
```

## 5. Transition Animation

`AnimatePresence mode="wait"` wrapping the view body:

```ts
const slide = {
  initial: (dir: 1 | -1) => ({ x: 20 * dir, opacity: 0 }),
  animate: { x: 0, opacity: 1 },
  exit: (dir: 1 | -1) => ({ x: -20 * dir, opacity: 0 }),
};
// transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
```

Easing curve and duration match the existing outer panel collapse animation.

## 6. `DetailHeader` Component

**Used by:** every view except `overview`.

```tsx
// from a list view, back goes to overview:
<DetailHeader title="Clarifications" onBack={() => goBack({ name: 'overview' })} />
// from a per-agent detail, back goes to its parent list (e.g. 'clarifications' or 'building'):
<DetailHeader title={`${agent.name} — Decisions`} onBack={() => goBack({ name: 'clarifications' })} />
```

Visual:
- Container: `sticky top-0 z-10 bg-canvas border-b border-hairline px-5 pt-5 pb-4`
- Back button: `h-9 w-9 rounded-full bg-surface ring-1 ring-hairline grid place-items-center hover:bg-canvas-soft`
  - Icon: `<ArrowLeft className="h-4 w-4" strokeWidth={1.8} />`
- Title: `text-[17px] font-semibold text-ink`
- Flex: `flex items-center gap-3`

Overview keeps the existing eyebrow layout:
- `PROJECT CONTEXT` uppercase tracked label
- No page title underneath (removed — the 4 cards are the content)

## 7. Overview Cards — `OverviewList.tsx`

Matches mockup #9. Vertical stack of 4 drill-in cards with `gap-3`.

**Card base:**
- `rounded-[16px] border bg-surface p-4 flex items-center gap-4 w-full text-left`
- `transition-shadow hover:shadow-[0_4px_20px_-12px_rgba(28,25,23,0.15)]`
- Each card is a `<button>` that calls `goTo(...)`

**Per-card variants:**

| Card | Icon | Icon tile | Card border | Right badge |
|---|---|---|---|---|
| Clarifications | `Boxes` | `bg-[#fde2ec] text-[#e11d74] h-11 w-11 rounded-[12px]` | `border-[#f5c6d9]` | Round pill `bg-[#fde2ec] text-[#e11d74] h-6 min-w-[24px] px-2 text-[12px] font-bold`, content = count |
| Building Process | `Settings2` | `bg-warning-50 text-warning-500 h-11 w-11 rounded-[12px]` | `border-warning-200` | `inline-flex items-center gap-1 rounded-full bg-warning-50 text-warning-600 px-2.5 py-0.5 text-[11.5px] font-semibold` + leading `●` (h-1.5 w-1.5 bg-warning-500) + "Live" |
| Agent Reports | `FileCode2` | `bg-canvas-soft text-ink-soft h-11 w-11 rounded-[12px]` | `border-hairline` | — |
| History | `History` | `bg-canvas-soft text-ink-soft h-11 w-11 rounded-[12px]` | `border-hairline` | — |

**Text block (middle):**
- Title: `text-[15.5px] font-semibold text-ink`
- Subtitle: `text-[12px] text-ink-muted mt-0.5`
  - Clarifications: "2 Agents awaiting decisions"
  - Building Process: "2 Agents running in parallel"
  - Agent Reports: "2 New Updates"
  - History: "View & undo past actions"

**Chevron (right-most):** `<ChevronRight className="h-4 w-4 text-ink-muted flex-shrink-0" />`

## 8. Clarifications

### 8.1 List — `ClarificationsList.tsx` (mockup #10)

Header (via `DetailHeader`): title "Clarifications".

Description row:
```
Two agents are working in parallel and need your input before continuing.
```
Style: `text-[12.5px] leading-[1.55] text-ink-muted mb-4`

**Agent cards** (vertical, `gap-3`):
- Outer: `rounded-[14px] border p-4` (full tint set by agent tone below)
- Border + bg tinted by agent tone:
  - GPT tone "green": `border-[#8cc7a8] bg-[#f4faf6]`
  - Claude tone "orange": `border-warning-200 bg-warning-50/40`
- Header row: `flex items-start gap-3`
  - Avatar: `h-11 w-11 rounded-[12px] grid place-items-center text-white font-semibold text-[14px]` with agent color (GPT `bg-[#2f855a]`, Claude `bg-[#c2410c]`)
  - Name block:
    - Line 1: `<name>` (`text-[15px] font-semibold text-ink`) + role chip `inline-flex items-center rounded-md bg-canvas-soft px-2 py-0.5 text-[11px] text-ink-soft ml-2`
    - Line 2: task title (`text-[12.5px] text-ink-muted mt-0.5`)
  - Right: `<ChevronRight className="h-4 w-4 text-ink-muted ml-auto mt-1.5" />`
- Footer row: `mt-3 flex items-center justify-between`
  - Left: "Pending decisions" (`text-[11.5px] text-ink-muted`)
  - Right: red pill `rounded-full bg-[#fde2ec] text-[#e11d74] px-2.5 py-1 text-[11.5px] font-semibold` + content = "N awaiting"

Card is a `<button>` that calls `goTo({ name: 'clarification-agent', agentId })`.

**Seed data:**
```ts
const CLARIFICATION_AGENTS = [
  { id: 'gpt-5-4', name: 'GPT-5.4', role: 'Strategist', tone: 'green',
    task: 'Weather API & Deployment Strategy', pending: 1 },
  { id: 'claude-4-6', name: 'Claude-4.6', role: 'Architect', tone: 'orange',
    task: '3D Rendering Engine Selection', pending: 1 },
];
```

### 8.2 Detail — `ClarificationDetail.tsx` (mockup #11)

Header: title `"{agent.name} — Decisions"`, back → `clarifications`.

**Agent summary card** (compact, tinted by agent tone):
- `rounded-[14px] border ... p-3 flex items-center gap-3` (same color as in list)
- Avatar (same as list) + `{name} · {role}` (text-[13.5px] font-semibold text-ink-soft) + task (text-[12px] text-ink-muted)

**Decision cards** (one or more; mockup shows one):
- Outer: `rounded-[14px] border border-hairline bg-surface p-4 mt-3`
- Header row: icon (globe for API) + title + subtitle ("Select the primary data source for weather information.")
- Options (radio list): each is a `<button>` —
  - Base: `w-full rounded-[12px] border px-3 py-2.5 flex items-start gap-3 text-left`
  - Default: `border-hairline bg-canvas hover:border-warning-300`
  - Selected: `border-warning-300 bg-warning-50/50`
  - Radio visual (right-side): `h-4 w-4 rounded-full ring-1 ring-hairline grid place-items-center`
    - Selected: outer ring `ring-warning-500`, inner dot `h-2 w-2 rounded-full bg-warning-500`
  - Text block: `text-[13.5px] font-semibold text-ink` + `text-[11.5px] text-ink-muted`

**Confirm button** (sticky at bottom of detail scroll view):
- `mt-4 h-10 w-full rounded-[12px] bg-[#1c1917] text-white text-[13px] font-semibold flex items-center justify-center gap-2 hover:bg-[#2a2724]`
- `<CheckCircle2 className="h-4 w-4" />` + "Confirm Selection"
- Click handler: no-op for Phase 2 (or `console.log`) — Phase 3 will wire.

**Seed data (for GPT-5.4):**
```ts
{
  decision: 'Weather API Provider',
  subtitle: 'Select the primary data source for weather information.',
  icon: 'Globe',
  options: [
    { id: 'open',      label: 'OpenWeather API', meta: 'Free tier available, reliable global data.', recommended: true },
    { id: 'tomorrow',  label: 'Tomorrow.io',     meta: 'Hyper-local, excellent for 3D visualization.' },
    { id: 'weatherbit',label: 'WeatherBit',      meta: 'Cost-effective, broad global coverage.' },
  ]
}
```

## 9. Building Process

### 9.1 List — `BuildingProcessList.tsx` (mockup #12)

Header: title "Building Process". Description:
```
These agents are executing tasks in parallel. Some require your approval to proceed.
```

**Agent progress cards:**
- Outer: `rounded-[14px] border p-4` (tint set by agent tone below)
- Tinted per agent:
  - Claude: `border-warning-200 bg-warning-50/30`
  - DeepSeek: `border-[#99d6cc] bg-[#f0faf7]`
- Header row: avatar (same rounded-square style) + name + status chip
  - Status chip:
    - **Waiting**: `bg-warning-50 text-warning-600 rounded-md px-2 py-0.5 text-[11px] font-semibold`
    - **Running**: same as Waiting + leading `●` animated dot
- Task title row: `text-[12.5px] text-ink-muted mt-0.5`
- Chevron top-right (`ml-auto` on header block)
- Progress row:
  - Label "Progress" (left) + "XX%" (right) — `flex items-center justify-between text-[11.5px] text-ink-muted mt-3`
  - Bar: `h-1.5 rounded-full bg-canvas-soft overflow-hidden`
  - Fill: `h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600` animated from 0 → target%
- Footer right pill: `rounded-full bg-[#fde2ec] text-[#e11d74] px-2.5 py-1 text-[11.5px] font-semibold` "N approval needed"

Card click → `goTo({ name: 'building-agent', agentId })`.

**Seed data:**
```ts
const BUILDING_AGENTS = [
  { id: 'claude-4-6', name: 'Claude-4.6', tone: 'orange', avatar: 'C',
    task: 'Environment & Deployment Config', status: 'waiting', progress: 40,
    approvals: 2 },
  { id: 'deepseek',   name: 'DeepSeek',   tone: 'teal',   avatar: 'D',
    task: 'Component Architecture & UI',    status: 'running', progress: 65,
    approvals: 1 },
];
```

### 9.2 Detail — `BuildingAgentDetail.tsx` (mockup #13) — **new content**

Header: title `"{agent.name} — Process"`, back → `building`.

**1) Agent header card** (same tint as list card):
- Avatar + `{name} · {subrole}` (subrole: "Env Configurator", "Component Engineer", …) + task
- Right: animated status dot (`h-2 w-2 rounded-full bg-warning-500 animate-pulse`)
- Progress: "Task progress" label + percent + same gradient bar

**2) ACTIVITY LOG section**
- Section label: `text-[11px] font-semibold uppercase tracking-wider text-ink-muted flex items-center gap-1.5 mt-5 mb-2`
  - Prefix `>_` rendered as literal text or small `<Terminal />` icon
- Terminal panel:
  - `rounded-[12px] bg-[#1c1917] p-4 font-mono text-[12px] leading-[1.7] text-[#86efac]`
  - Each line prefixed with dimmed `$ ` (`text-[#86efac]/60`)
  - Last line: blinking cursor — `<span className="inline-block w-2 h-[1em] bg-[#86efac] align-middle ml-0.5 animate-pulse" />`

**Seed lines (Claude):**
```
Scanning project root...
Found package.json — valid Node project
Queuing npm install tasks...
```
(Last rendered line has the cursor; no `$` text after it — just `$ ` + cursor.)

**3) PENDING APPROVALS section**
- Section label (same style as ACTIVITY LOG)
- Approval cards (vertical, `gap-3`):
  - Outer: `rounded-[14px] border border-warning-200 bg-warning-50/40 p-4`
  - Top row: small icon + title (`text-[13.5px] font-semibold text-ink`)
  - Sub row: command or note in `font-mono text-[12px] text-ink-muted mt-1` — truncate with `overflow-hidden text-ellipsis whitespace-nowrap`
  - Button row (`mt-3 flex gap-2`):
    - Approve: `flex-1 h-9 rounded-[10px] bg-gradient-to-b from-success-400 to-success-500 text-white text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5` + `<CheckCircle2 />`
    - Deny: `flex-1 h-9 rounded-[10px] bg-surface ring-1 ring-hairline text-ink text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-canvas-soft` + `<XCircle />`

**Seed (Claude):**
```ts
[
  { icon: 'Terminal', title: 'Install 3D rendering dependencies.',
    detail: 'npm install three @react-three/fiber @react-three/drei' },
  { icon: 'Settings', title: 'Set up environment variables file.',
    detail: 'Create .env with OPENWEATHER_API_KEY placeholder' },
]
```

Click handlers for Approve / Deny: local state removes the item (optimistic UI). No backend.

## 10. Agent Reports — `AgentReports.tsx`

**Option A (chosen):** keep the existing 3-card list content from `AgentReportsTab` and wrap with `DetailHeader`.

- Header: `DetailHeader` title "Agent Reports", back → `overview`
- Description: "Latest artifacts from parallel agents." (`text-[12.5px] text-ink-muted mb-4`)
- Body: same 3 cards as today (author, title, summary, time).

No other changes.

## 11. History — `HistoryTimeline.tsx` (mockups #14 and #15)

### 11.1 Data model

```ts
type HistoryEntry = {
  id: string;
  label: string;
  meta: string;
  time: string;           // "10:44 AM"
  reversible: boolean;
  undone: boolean;
};

const SEED: HistoryEntry[] = [
  { id: 'h1', label: 'API Provider Selected',    meta: 'OpenWeather API approved by user.',   time: '10:44 AM', reversible: true,  undone: false },
  { id: 'h2', label: 'Vercel Deployment Confirmed', meta: 'User selected Vercel as deployment target.', time: '10:43 AM', reversible: true,  undone: false },
  { id: 'h3', label: 'Workflow Generated',        meta: 'Created 6 nodes based on requirements.', time: '10:42 AM', reversible: true,  undone: false },
  { id: 'h4', label: 'Project Initiated',         meta: 'Started by YiKai.',                   time: '10:41 AM', reversible: false, undone: false },
];
```

### 11.2 Visual

Header: `DetailHeader` title "History".

Description: `All actions taken in this session. You can undo reversible actions.` (`text-[12.5px] text-ink-muted mb-5`)

**Timeline:**
- Outer container: `relative pl-6` (no visible rail by default — rail rendered per item via pseudo-elements or absolute div):
  - Vertical rail: `<span className="absolute left-[11px] top-2 bottom-2 w-px bg-hairline" aria-hidden />`
- Each entry: `relative pb-4 last:pb-0`
- Dot (positioned `absolute left-0 top-2.5`):
  - **First not-undone reversible entry (most recent "current")**: `h-5 w-5 rounded-full bg-success-100 ring-2 ring-canvas grid place-items-center` → inner `h-2.5 w-2.5 rounded-full bg-success-500`
  - **Other not-undone**: `h-5 w-5 rounded-full bg-canvas-soft ring-2 ring-canvas grid place-items-center` → inner `h-2 w-2 rounded-full bg-ink-muted/40`
  - **Undone**: `h-5 w-5 rounded-full bg-canvas-soft ring-2 ring-canvas grid place-items-center text-ink-muted` → icon `<RotateCcw className="h-2.5 w-2.5" />`
- Card (right of dot): `rounded-[12px] border border-hairline bg-surface p-3 ml-2`
  - Top row: `flex items-start justify-between gap-2`
    - Label `text-[13.5px] font-semibold text-ink`
    - Time `text-[11px] text-ink-muted`
  - Meta `text-[12px] text-ink-muted mt-0.5`
  - Action button row (`mt-2.5`):
    - Button base: `inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-canvas-soft text-[12px] font-semibold hover:bg-canvas-soft/80`
    - **Undo**: icon `<RotateCcw className="h-3.5 w-3.5" />` + "Undo", `text-ink-soft`
    - **Redo**: icon `<RotateCw className="h-3.5 w-3.5" />` + "Redo", `text-success-600`
    - Not rendered if `!reversible`
  - **Undone card styling**: whole card `opacity-75`, label+meta get `line-through text-ink-muted`

### 11.3 Interactions

```ts
const toggle = (id: string) =>
  setEntries(prev => prev.map(e => e.id === id ? { ...e, undone: !e.undone } : e));
```

Phase 3 note: when the undo stack is wired to real app state, this toggle becomes a dispatch to a store. For now the visual state and data live together inside `HistoryTimeline.tsx`.

## 12. ChatThread — Remove Undo Button

**File:** `frontend/components/orchestra/ChatThread.tsx`

Remove:
- Props `onUndo?: () => void` and `canUndo?: boolean` (lines 70–71)
- Prop destructuring at lines 80–81
- `handleUndo` definition (lines 109–111)
- The button block including `onClick={handleUndo}` (lines 140–160, roughly the entire `<button ...>` whose icon is `<CornerUpLeft />` labeled "Undo")
- `CornerUpLeft` from the `lucide-react` import if unused elsewhere in the file

**File:** `frontend/app/(app)/orchestra/page.tsx`

No changes required (`onUndo`/`canUndo` are not passed currently); nothing else wires to them. Double-check during implementation.

**Audit step:** grep the frontend directory for `onUndo` and `canUndo` after edits; should return zero hits.

## 13. Shared Types / Mock Data Strategy

Keep per-view seed data **inline** at the top of each view file for Phase 2. Rationale:
- The data is throwaway — Phase 3 replaces each with a hook/selector from the real store.
- Keeping it inline makes each view self-contained and reviewable in isolation.
- Hoisting to a shared `context/mockData.ts` would be churn during Phase 3 anyway.

No shared `types.ts` file; inline types are local to each view. Exception: `Agent` shape used by both ClarificationsList and ClarificationDetail — will re-declare in each (small surface, acceptable duplication).

## 14. Accessibility

- All drill-in cards are `<button>` with visible focus ring (`focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas`)
- Back button in `DetailHeader`: `aria-label="Back"`
- Status chips rely on text, not color alone
- Terminal panel: `role="log"` with `aria-live="polite"` on the cursor line
- Undone history items: `aria-label` augmented with "(undone)"

## 15. File-by-file Change Summary

| File | Action |
|---|---|
| `components/orchestra/ContextPanel.tsx` | Rewrite: shell + view router + AnimatePresence slide |
| `components/orchestra/context/DetailHeader.tsx` | NEW |
| `components/orchestra/context/OverviewList.tsx` | NEW |
| `components/orchestra/context/ClarificationsList.tsx` | NEW |
| `components/orchestra/context/ClarificationDetail.tsx` | NEW |
| `components/orchestra/context/BuildingProcessList.tsx` | NEW |
| `components/orchestra/context/BuildingAgentDetail.tsx` | NEW |
| `components/orchestra/context/AgentReports.tsx` | NEW (content copied from current `AgentReportsTab`) |
| `components/orchestra/context/HistoryTimeline.tsx` | NEW |
| `components/orchestra/ChatThread.tsx` | Remove Undo button and related props/handlers |
| `app/(app)/orchestra/page.tsx` | Verify no Undo props passed; likely no change |

## 16. Verification Plan

1. `npm run lint && npm run typecheck` clean.
2. Manual QA against every mockup:
   - Overview cards render with correct colors/badges; click each drills in with slide-right animation.
   - Back arrow returns with slide-left animation.
   - Clarifications: 2 agent cards, colors match; click GPT drills to decision page; radio selection visually toggles; Confirm button disabled-looking but clickable (no-op OK).
   - Building Process: 2 progress cards with correct %; click Claude drills to activity log + 2 approval cards; Approve/Deny removes card.
   - Agent Reports: 3 cards visible with same content as previously.
   - History: 4 entries; green dot on top entry; click Undo on first entry → strikethrough + Redo button; click Redo → back to Undo; "Project Initiated" has no button.
   - Chat composer: no Undo button present; composer layout unchanged.
3. Tab key navigation reaches every interactive element in visual order.

## 17. Out of Scope / Follow-ups (Phase 3+)

- Wire Clarifications Confirm → WebSocket event
- Wire Building Process Approve/Deny → agent-command dispatch
- Real activity log streaming
- Promote view state to Zustand if cross-component deep-linking is required
- Real Undo/Redo integration with the app's action log
