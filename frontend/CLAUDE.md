@AGENTS.md

## Frontend Notes

- Next.js 15 (Turbopack), app directory at `frontend/app/`
- Components at `frontend/components/` (not `src/components/`)
- Stores at `frontend/stores/` (Zustand)
- Hooks at `frontend/hooks/`
- shadcn/ui components at `frontend/components/ui/`
- Socket.io connects to backend at `NEXT_PUBLIC_SOCKET_URL`
- **Warm light theme** (no `dark` class on html) — source of truth is `frontend/app/globals.css`
- Typography: **Inter** loaded in `frontend/app/layout.tsx` via next/font
- Icon library: **lucide-react**

### App shell & routes

- All product pages live inside the `app/(app)/` route group, which wraps them with `AppSidebar` + `TopBar`.
- Routes: `/dashboard` (landing), `/orchestra` (multi-AI chat, 3-col collapsible), `/workflows` (React Flow canvas + node drawer). `/marketplace`, `/arena`, `/team`, `/settings` are placeholders.
- `app/page.tsx` redirects `/` → `/dashboard`.

### Design tokens (from Figma)

Exposed as Tailwind v4 theme utilities in `globals.css`:

- Surfaces: `bg-canvas` (`#f5efe7`), `bg-canvas-soft`, `bg-surface`, `bg-surface-subtle`
- Text: `text-ink`, `text-ink-soft`, `text-ink-muted`
- Borders: `border-hairline`
- Brand scale: `bg-brand-50 … bg-brand-700` (orange `#ff6900` at 500)
- Status: `bg-success-*`, `bg-warning-*`, `bg-danger-*`

### Component folders

- `components/layout/` — AppSidebar, TopBar, ComingSoon
- `components/dashboard/` — HeroCard, StatCard, ProjectCard
- `components/orchestra/` — RecentProjectsPanel, ChatThread, ContextPanel (shell with view router); drill-in views live in `components/orchestra/context/` (OverviewList, ClarificationsList, ClarificationDetail, BuildingProcessList, BuildingAgentDetail, AgentReports, HistoryTimeline, DetailHeader)
- `components/workflows/` — WorkflowCanvas (React Flow), TaskNodeCard, NodeDetailDrawer, Breadcrumbs
- `components/chat/`, `components/workflow/` — legacy from Phase 1, kept for store integration in Phase 3
