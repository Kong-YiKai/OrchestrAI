# OrchestrAI

**OrchestrAI** is an AI-powered workflow orchestration platform. Describe any idea in natural language — OrchestrAI breaks it down into a structured, visual multi-step workflow, assigns the best AI model to each step, and executes it with full transparency.

Think of it as a conductor: one prompt sets off a coordinated ensemble of AI agents, each playing its part.

---

## Why OrchestrAI

Most AI tools are single-turn: you ask, it answers. Real-world tasks aren't like that. Building software, running research, or automating a process requires multiple steps, decisions, and tools working together.

OrchestrAI is built around three ideas:

- **Conversation before action** — the AI clarifies your intent before generating anything. You approve the plan, then it builds.
- **Transparent execution** — every agent action is logged and visible, like watching a terminal but for AI reasoning.
- **Composable by design** — each workflow node can run a different AI model. Claude for reasoning, GPT for drafting, Gemini for summarization — mix and match per task.

---

## How It Works

```
You describe a goal
        ↓
Orchestrator identifies it as a build request
        ↓
Clarifier asks targeted questions to fill in the gaps
        ↓
You review and approve the plan
        ↓
Workflow Designer generates a multi-step workflow
        ↓
Each node executes with its assigned AI model
        ↓
Full log of every action, visible in real time
```

---

## Features


| Feature                                            | Status     |
| -------------------------------------------------- | ---------- |
| Natural language → workflow generation             | ✅ Phase 3  |
| Multi-turn clarification before building           | ✅ Phase 3  |
| Real-time streaming AI responses                   | ✅ Phase 3  |
| Visual workflow canvas (React Flow)                | ✅ UI ready |
| Per-node AI model selection                        | ✅ UI ready |
| Node execution engine (API / Browser / Simulation) | 🔲 Phase 6 |
| Nested sub-chat per node                           | 🔲 Phase 5 |
| Multi-AI fan-out (Claude + GPT + Gemini)           | 🔲 Phase 7 |
| Workflow persistence (PostgreSQL)                  | ✅ Done     |
| Docker one-command deployment                      | ✅ Done     |


---

## Quick Start

**Prerequisites:** Docker Desktop installed and running.

```bash
# 1. Clone and configure
git clone <repo-url>
cd OrchestrAI
cp backend/.env.example backend/.env
# Fill in ANTHROPIC_API_KEY in backend/.env

# 2. Start everything
docker compose up --build

# 3. Open http://localhost:3000
```

That's it. PostgreSQL, the Python backend, and the Next.js frontend all start together.

### Stopping

```bash
docker compose down        # Stop containers, keep database data
docker compose down -v     # Stop and wipe database
```

### Local Development (without Docker)

```bash
# Start only the database
docker compose up db

# Terminal 1 — Backend
cd backend
python -m venv venv && source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn main:socket_app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
npm install && npm run dev
```

---

## Configuration

Edit `backend/.env`:

```env
# Required — core workflow generation and chat
ANTHROPIC_API_KEY=sk-ant-...

# Optional — GPT commentary in multi-AI mode
OPENAI_API_KEY=sk-...

# Optional — Gemini commentary in multi-AI mode
GOOGLE_API_KEY=...
```

Without `ANTHROPIC_API_KEY`, workflow generation will not work.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Browser                        │
│  Dashboard · Orchestra (3-col) · Workflows       │
│  Next.js 15 · Zustand · Socket.io client         │
└─────────────────┬───────────────────────────────┘
                  │ WebSocket (Socket.io)
                  │ HTTP (REST)
┌─────────────────▼───────────────────────────────┐
│              FastAPI + python-socketio            │
│                                                  │
│  OrchestratorAgent  →  route: chat | build       │
│  ClarifierAgent     →  multi-turn Q&A + plan     │
│  WorkflowDesigner   →  generate workflow JSON    │
│  ExecutorService    →  run nodes (Phase 6)       │
└─────────────────┬───────────────────────────────┘
                  │ SQLAlchemy async
┌─────────────────▼───────────────────────────────┐
│              PostgreSQL 16                        │
│  workflows · chat_messages                       │
└─────────────────────────────────────────────────┘
```

**Agent Model Assignment**


| Agent             | Model                 | Role                                      |
| ----------------- | --------------------- | ----------------------------------------- |
| Orchestrator      | Claude Haiku 4.5      | Fast intent routing                       |
| Clarifier         | Claude Sonnet 4.6     | Multi-turn clarification, plan generation |
| Workflow Designer | Claude Sonnet 4.6     | Workflow structure generation             |
| Node Executor     | Per-node configurable | Task execution (Phase 6)                  |


---

## Tech Stack


| Layer              | Technology                                  |
| ------------------ | ------------------------------------------- |
| Frontend           | Next.js 15 (Turbopack, App Router)          |
| UI                 | Tailwind v4 + shadcn/ui                     |
| State              | Zustand                                     |
| Animation          | Framer Motion                               |
| Workflow Canvas    | @xyflow/react (React Flow)                  |
| Realtime           | Socket.io                                   |
| Backend            | Python FastAPI + python-socketio (ASGI)     |
| Database           | PostgreSQL 16 + SQLAlchemy async + asyncpg  |
| AI                 | Anthropic Claude, OpenAI GPT, Google Gemini |
| Browser Automation | Playwright (Phase 6)                        |
| Deployment         | Docker Compose                              |


---

## Project Structure

```
OrchestrAI/
├── docker-compose.yml
├── docs/
│   └── superpowers/
│       └── plans/                           # Phase planning docs
│           ├── project-phases-overview.md
│           ├── phase3-orchestra-wiring.md
│           ├── 2026-04-17-orchestra-context-panel-redesign.md
│           ├── 2026-04-21-ui-polish-cleanup.md        # Phase 2.6 plan
│           └── 2026-04-21-handoff-report.md           # Phase 2.6 handoff / key-file summary
│
├── frontend/                                # Next.js 15 (Turbopack, App Router)
│   ├── app/
│   │   ├── globals.css                      # Design tokens (Tailwind v4 CSS vars)
│   │   ├── layout.tsx                       # Root layout (next/font Inter)
│   │   ├── page.tsx                         # Root → redirect to /dashboard
│   │   └── (app)/                           # App shell route group
│   │       ├── layout.tsx                   # AppSidebar + TopBar shell
│   │       ├── dashboard/page.tsx           # Landing page
│   │       ├── orchestra/page.tsx           # 3-col AI orchestration UI (core)
│   │       ├── workflows/page.tsx           # React Flow workflow canvas
│   │       ├── marketplace/page.tsx         # Placeholder (Phase 7)
│   │       ├── arena/page.tsx               # Placeholder (Phase 7)
│   │       ├── team/page.tsx                # Placeholder (Phase 7)
│   │       └── settings/page.tsx            # Placeholder (Phase 7)
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppSidebar.tsx               # Left nav sidebar
│   │   │   ├── TopBar.tsx                   # Top bar with breadcrumb
│   │   │   └── ComingSoon.tsx               # Generic placeholder page
│   │   │
│   │   ├── dashboard/
│   │   │   ├── HeroCard.tsx                 # Dashboard hero card
│   │   │   ├── ProjectCard.tsx              # Recent project card
│   │   │   └── StatCard.tsx                 # Metric stat card
│   │   │
│   │   ├── orchestra/                       # /orchestra page components
│   │   │   ├── ChatThread.tsx               # Left col: streaming chat UI
│   │   │   ├── ContextPanel.tsx             # Right col: stack-nav shell
│   │   │   ├── RecentProjectsPanel.tsx      # Middle col: recent projects list
│   │   │   └── context/                     # ContextPanel drill-in views
│   │   │       ├── DetailHeader.tsx         # Shared back-arrow header
│   │   │       ├── OverviewList.tsx         # 4-card overview (Clarifications / Building / Reports / History)
│   │   │       ├── ClarificationsList.tsx   # Per-agent clarification list; dual-view: ask | confirm plan
│   │   │       ├── ClarificationDetail.tsx  # Per-agent decision radio cards
│   │   │       ├── BuildingProcessList.tsx  # Per-agent progress bars + status chips
│   │   │       ├── BuildingAgentDetail.tsx  # Activity log (terminal) + approval cards
│   │   │       ├── AgentReports.tsx         # Artifact report cards
│   │   │       └── HistoryTimeline.tsx      # Undo/Redo timeline
│   │   │
│   │   ├── workflows/                       # /workflows page components (canonical)
│   │   │   ├── WorkflowCanvas.tsx           # React Flow canvas with auto-layout
│   │   │   ├── TaskNodeCard.tsx             # Custom React Flow node renderer
│   │   │   ├── NodeDetailDrawer.tsx         # Side drawer for node detail
│   │   │   └── Breadcrumbs.tsx              # Workflow breadcrumb nav
│   │   │
│   │   │   # NOTE: `components/workflow/` (legacy, 6 files) and `components/chat/` (legacy, 4 files)
│   │   │   #       are `@deprecated` stubs as of 2026-04-21 (Phase 2.6). They can be physically
│   │   │   #       removed via `rm -rf components/workflow components/chat` in any future cleanup.
│   │   │
│   │   └── ui/                              # shadcn/ui component wrappers
│   │       ├── avatar.tsx
│   │       ├── badge.tsx
│   │       ├── button.tsx
│   │       ├── drawer.tsx
│   │       ├── scroll-area.tsx
│   │       ├── select.tsx
│   │       ├── separator.tsx
│   │       └── tooltip.tsx
│   │
│   ├── hooks/
│   │   └── useSocket.ts                     # Socket.io event bindings → orchestraStore
│   │
│   ├── stores/                              # Zustand global state
│   │   ├── orchestraStore.ts                # Conv state, messages, clarifications, building logs, history (canonical)
│   │   ├── chatStore.ts                     # @deprecated stub — removed 2026-04-21 (Phase 2.6)
│   │   └── workflowStore.ts                 # Workflow nodes + selected node
│   │
│   └── lib/
│       ├── socket.ts                        # Socket.io client singleton
│       ├── api.ts                           # REST API helpers
│       └── utils.ts                         # cn() and shared utilities
│
└── backend/                                 # Python FastAPI + python-socketio (ASGI)
    ├── main.py                              # App entry: Socket.io events, REST router mount
    ├── socket_manager.py                    # Socket.io server instance + room helpers
    ├── database.py                          # SQLAlchemy async engine + session factory
    ├── config.py                            # Settings (env vars via pydantic-settings)
    │
    ├── models/
    │   ├── workflow.py                      # Pydantic API models (Workflow, WorkflowNode)
    │   ├── chat.py                          # Pydantic chat models (ChatMessage, BuildingLog, PlanPayload…)
    │   └── db.py                            # SQLAlchemy ORM (WorkflowRecord, ChatMessageRecord)
    │
    ├── services/
    │   ├── conversation_manager.py          # ConversationState dataclass + per-session CRUD
    │   ├── orchestrator_agent.py            # Intent routing: casual_chat | development_request (Haiku)
    │   ├── orchestrator.py                  # Higher-level orchestration helpers
    │   ├── clarifier_agent.py               # Multi-turn clarification + plan generation (Sonnet)
    │   ├── workflow_designer.py             # Workflow JSON generation (Sonnet)
    │   ├── multi_ai.py                      # Multi-AI fan-out: GPT / Gemini commentary (Phase 7)
    │   ├── executor.py                      # Node execution engine scaffold (Phase 6)
    │   └── workflow_db.py                   # Workflow CRUD + _coerce_created_at fix
    │
    ├── routers/
    │   ├── workflow.py                      # GET/PATCH /api/workflow/*
    │   ├── chat.py                          # /api/chat/*
    │   └── execution.py                     # POST /api/execution/* (Phase 6)
    │
    ├── prompts/                             # System prompt markdown files
    │   ├── orchestrator_system.md
    │   ├── clarifier_system.md
    │   └── workflow_designer_system.md
    │
    ├── browser/                             # Playwright browser automation (Phase 6)
    │   ├── pool.py                          # Browser instance pool
    │   └── automations/                     # Per-task automation scripts
    │
    └── tests/
        ├── test_orchestrator_agent.py
        ├── test_clarifier_agent.py
        ├── test_conversation_manager.py
        ├── test_workflow_designer.py
        └── test_workflow_db.py
```

---

## API Reference


| Method | Endpoint                              | Description          |
| ------ | ------------------------------------- | -------------------- |
| GET    | `/api/health`                         | Health check         |
| GET    | `/api/workflow/{id}`                  | Get workflow by ID   |
| PATCH  | `/api/workflow/{id}/node/{node_id}`   | Update node AI model |
| POST   | `/api/execution/run/{workflow_id}`    | Execute workflow     |
| POST   | `/api/execution/node/{node_id}/retry` | Retry a failed node  |


**Socket.io Events (key)**


| Direction       | Event                      | Purpose                          |
| --------------- | -------------------------- | -------------------------------- |
| Client → Server | `chat_send`                | Send a message                   |
| Client → Server | `chat_confirm_start`       | Confirm plan, trigger generation |
| Server → Client | `chat:stream_token`        | Streaming AI response token      |
| Server → Client | `clarification:update`     | New clarification questions      |
| Server → Client | `clarification:plan_ready` | Plan ready for user approval     |
| Server → Client | `building:log`             | Agent activity log entry         |
| Server → Client | `workflow:ready`           | Workflow generated and saved     |


---

## Development Status

The project is being built in phases. Current status:

- **Infrastructure** ✅ — Docker Compose, PostgreSQL, FastAPI, Socket.io, Next.js app shell
- **UI shell** ✅ — All pages and components built with placeholder data
- **AI orchestration** ✅ — Phase 3 wired end-to-end: `chat_send → clarifier → plan_ready → chat_confirm_start → workflow_designer → building:log → workflow:ready`. `/workflows` canvas auto-populates, Building Process panel shows per-node agent cards.
- **Design system v2** ✅ — Phase 2.6 (2026-04-21) — 5-level surfaces, warm-tinted hairlines, 8-stop brand palette, unified radius/elevation/typescale, glass utilities, grain texture, soft-pulse motion, `prefers-reduced-motion` support. Legacy `components/workflow/` and `components/chat/` reduced to `@deprecated` stubs.
- **Workflow execution** 🔲 — Node-by-node execution engine with browser autom