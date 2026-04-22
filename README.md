# OrchestrAI

**OrchestrAI** is an AI-powered workflow orchestration platform built for **real desktop tasks** — not just chatting with an AI. Describe any goal in natural language, and OrchestrAI breaks it down into a structured visual workflow, assigns the best AI model to each step, executes it across browser, filesystem, and desktop, and shows every move in real time.

Think of it as a conductor for an orchestra of AI agents, each playing its part — and each capable of picking up a real instrument on the user's machine.

---

## Why OrchestrAI

Most AI tools are single-turn: you ask, it answers. Real-world tasks aren't like that. Building software, running research, automating a repeatable process, or turning an image into a 3D model all require multiple steps, decisions, and tools working together — and sometimes require the AI to **actually operate the computer**.

OrchestrAI is built around four ideas:

- **Conversation before action** — the AI clarifies your intent before generating anything. You approve the plan, then it builds.
- **Universal perception** — agents can read any web page, video, audio, PDF, 3D file, or Office document. Multimodal is a first-class citizen, not an afterthought.
- **Real desktop reach** — agents don't stop at the browser. They can launch applications, manage files, install programs, and automate desktop workflows (e.g., "clear my Genshin daily quests every morning", or "use the Tripo website to turn this image into a 3D model and open it in Blender").
- **Composable by design** — each workflow node can run a different AI model. Claude for reasoning, GPT for drafting, Gemini for multimodal perception — mix and match per task.

All of this runs inside a disciplined **Agent Harness** — the engineering backbone that keeps autonomous systems observable, recoverable, and safe.

---

## Agent Harness Engineering

Every capability in OrchestrAI is designed against six mandatory dimensions, applied both to how we build OrchestrAI and to how users build workflows on top of it:

| Dimension | What it means |
| --- | --- |
| **Context Engineering** | Layered instruction files form a knowledge base; sub-agents act as firewalls isolating high-noise work; auto-compaction fights context entropy. |
| **Tool Orchestration** | Tools are curated per agent — not stacked indiscriminately. Internal services with optional MCP wrappers; all execution sandboxed away from the host. |
| **Verification** | Deterministic checks (linters, type checkers, tests) plus multi-agent review loops; generator and evaluator are separate agents to avoid self-endorsement. |
| **State Management** | Progress checklists and DB/Git checkpoints per workflow; trajectories persisted so failed runs resume from the last safe point. |
| **Observability** | Full execution traces with structured logs; per-node quality grading; failure attribution back to the underlying root cause (prompt / model / tool / external service). |
| **Human-in-the-Loop** | Hard boundary — destructive operations (DB deletion, billing, customer emails, software install/uninstall) require human approval. Kill switch always available. |

See `Documents/project-overview.md` §4.5 for the full spec. Every Phase opens by declaring how it contributes to the six dimensions.

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
Each node runs with its assigned AI model and tool set
        ├── Web perception (search + fetch + multimodal)
        ├── Sandboxed tool execution (code, API calls)
        └── Computer Use Agent (desktop automation) [Phase 7+]
        ↓
Full log of every action, visible in real time
        ↓
High-risk actions pause for your approval
```

---

## Features

| Feature | Status |
| --- | --- |
| Natural language → workflow generation | ✅ Phase 3 |
| Multi-turn clarification before building | ✅ Phase 3 |
| Real-time streaming AI responses | ✅ Phase 3 |
| Visual workflow canvas (React Flow) | ✅ UI ready |
| Per-node AI model selection | ✅ UI ready |
| Design system v2 (warm palette, 5-level surfaces, glass, grain) | ✅ Phase 2.6 |
| Workflow canvas end-to-end data flow (list page + detail page + live node status) | 🔲 Phase 4 |
| Agent Harness foundation (structured logs, tracing, checkpoint & resume, HITL approval gate) | 🔲 Phase 4.5 |
| Universal Web Perception (search + fetch + multimodal preprocess for video / audio / 3D / Office) | 🔲 Phase 5 |
| Tool Registry + Node Executor (multi-model tool calling, Docker sandbox, separate evaluator) | 🔲 Phase 6 |
| Computer Use Agent MVP (desktop perception + basic actions on Windows) | 🔲 Phase 7 |
| Computer Use Agent extended (app lifecycle, cross-app flows, replay & kill switch) | 🔲 Phase 8 |
| Nested sub-chat per node + File Repository | 🔲 Phase 10 |
| Multi-AI fan-out (Claude + GPT + Gemini) + bilingual + marketplace/arena | 🔲 Phase 11 |
| Workflow persistence (PostgreSQL) | ✅ Done |
| Docker one-command deployment | ✅ Done |

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

# Required from Phase 5 — multimodal fallback (video / audio / long context)
GOOGLE_API_KEY=...

# Optional — GPT fan-out and evaluator alternative
OPENAI_API_KEY=sk-...

# Optional — Web search providers (Phase 5+)
TAVILY_API_KEY=...
BRAVE_SEARCH_API_KEY=...
EXA_API_KEY=...
```

Without `ANTHROPIC_API_KEY`, workflow generation will not work.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                    Browser                       │
│   Dashboard · Orchestra (3-col) · Workflows     │
│   Next.js 15 · Zustand · Socket.io client       │
└─────────────────┬───────────────────────────────┘
                  │ WebSocket (Socket.io) + HTTP (REST)
┌─────────────────▼───────────────────────────────┐
│             FastAPI + python-socketio            │
│                                                  │
│  Core Agents                                     │
│    OrchestratorAgent   — intent routing          │
│    ClarifierAgent      — multi-turn Q&A + plan   │
│    WorkflowDesigner    — workflow JSON gen       │
│                                                  │
│  Harness Foundation (Phase 4.5)                  │
│    Observability · Checkpoint · Approval Gate    │
│                                                  │
│  Perception Layer (Phase 5)                      │
│    Web Search · Fetch (httpx/Playwright)         │
│    Multimodal Preprocess (video/audio/3D/Office) │
│                                                  │
│  Tool Layer + Executor (Phase 6)                 │
│    Tool Registry · Docker Sandbox · Evaluator    │
│                                                  │
│  Computer Use Agent (Phase 7-8)                  │
│    Perception (mss/UIA/OCR)                      │
│    Action (pywinauto/pyautogui)                  │
│    Planner-Executor Loop                         │
│    Safety (capability scope + audit + HITL)      │
└─────────────────┬───────────────────────────────┘
                  │ SQLAlchemy async
┌─────────────────▼───────────────────────────────┐
│                PostgreSQL 16                     │
│  workflows · chat_messages                       │
│  agent_sessions · execution_traces (Phase 4.5)   │
│  approval_records · cua_action_log (Phase 7+)    │
└─────────────────────────────────────────────────┘
```

**Agent Model Assignment**

| Agent | Model | Role |
| --- | --- | --- |
| Orchestrator | Claude Haiku 4.5 | Fast intent routing |
| Clarifier | Claude Sonnet 4.6 | Multi-turn clarification, plan generation |
| Workflow Designer | Claude Sonnet 4.6 | Workflow structure generation |
| Node Executor | Per-node configurable | Task execution inside Docker sandbox (Phase 6) |
| Perception Agent | Gemini 2.x (multimodal) / Claude | Web & multimodal content understanding (Phase 5) |
| Desktop Agent | Claude Sonnet / Gemini Flash | Planner-Executor loop for Computer Use (Phase 7+) |
| Evaluator | Claude Opus / GPT (independent) | Verification, separate from generator (Phase 6) |

---

## Tech Stack

### Core (shipped)

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15 (Turbopack, App Router) |
| UI | Tailwind v4 + shadcn/ui |
| State | Zustand |
| Animation | Framer Motion |
| Workflow Canvas | @xyflow/react (React Flow) |
| Realtime | Socket.io |
| Backend | Python FastAPI + python-socketio (ASGI) |
| Database | PostgreSQL 16 + SQLAlchemy async + asyncpg |
| Reasoning AI | Anthropic Claude (Haiku 4.5 / Sonnet 4.6 / Opus) |
| Deployment | Docker Compose |

### Extended (introduced per Phase)

| Layer | Technology | Phase |
| --- | --- | --- |
| Structured logging | structlog or loguru | 4.5 |
| Tracing (optional) | OpenTelemetry + Jaeger | 4.5 |
| Checkpoint store | PostgreSQL `agent_sessions` table | 4.5 |
| Multimodal AI (fallback) | **Google Gemini 2.x** (native video / audio / long context) | 5 |
| Multimodal AI (Chinese scenarios) | ByteDance Doubao (optional) | 5 |
| Additional models | OpenAI GPT, DeepSeek | 5 |
| Web Search | **Tavily** (primary) + **Brave Search** (low-cost fallback) + **Exa** (semantic) | 5 |
| Web Fetch | httpx (static) + **Playwright** (dynamic / SPA / dashboards) | 5 |
| Web Parse | Trafilatura + Jina Reader fallback | 5 |
| Video pipeline | **yt-dlp** + ffmpeg + **OpenAI Whisper** | 5 |
| Audio pipeline | Whisper (local/API); Gemini 2.x fallback | 5 |
| 3D file pipeline | trimesh + pyrender (multi-view render → VLM) | 5 |
| Office docs | mammoth (docx) + python-pptx (pptx) + openpyxl (xlsx) | 5 |
| Tool calling adapter | Custom `ToolRegistry` + per-model schema transforms | 6 |
| Execution sandbox | Docker (per-node container) | 6 |
| Desktop screen capture | **mss** (cross-platform) | 7 |
| Desktop UI tree | **Microsoft UI Automation** via uiautomation / pywinauto | 7 |
| OCR | PaddleOCR or Tesseract | 7 |
| Input simulation | pywinauto (semantic, UIA) + pyautogui (pixel fallback) | 7 |
| Process / system | subprocess + PowerShell + pywin32 (Win32 API) | 8 |
| Replay & kill switch | Custom action log + psutil | 8 |

---

## Project Structure

```
OrchestrAI/
├── docker-compose.yml
├── Documents/
│   ├── project-overview.md                  # Start-of-shift read: snapshot + phase roadmap + Harness laws + index
│   ├── phase-history-and-handoff.md         # Completed phase archives + layered Tier A–E backlog
│   └── proposal.md                          # Original product proposal
│
├── frontend/                                # Next.js 15 (Turbopack, App Router)
│   ├── app/
│   │   ├── globals.css                      # Design tokens (Tailwind v4 CSS vars, v2)
│   │   ├── layout.tsx                       # Root layout (next/font Inter)
│   │   ├── page.tsx                         # Root → redirect to /dashboard
│   │   └── (app)/                           # App shell route group
│   │       ├── layout.tsx                   # AppSidebar + TopBar shell
│   │       ├── dashboard/page.tsx           # Landing page
│   │       ├── orchestra/page.tsx           # 3-col AI orchestration UI (core)
│   │       ├── workflows/page.tsx           # React Flow workflow canvas (Phase 4 → list + [id] split)
│   │       ├── marketplace/page.tsx         # Placeholder (Phase 11)
│   │       ├── arena/page.tsx               # Placeholder (Phase 11)
│   │       ├── team/page.tsx                # Placeholder (Phase 11)
│   │       └── settings/page.tsx            # Placeholder (Phase 11)
│   │
│   ├── components/
│   │   ├── layout/                          # AppSidebar, TopBar, ComingSoon
│   │   ├── dashboard/                       # HeroCard, ProjectCard, StatCard
│   │   ├── orchestra/                       # /orchestra page components
│   │   │   ├── ChatThread.tsx
│   │   │   ├── ContextPanel.tsx
│   │   │   ├── RecentProjectsPanel.tsx
│   │   │   └── context/                     # 8 drill-in views (Overview / Clarifications / Building / Reports / History)
│   │   ├── workflows/                       # Canonical workflow canvas stack
│   │   │   ├── WorkflowCanvas.tsx
│   │   │   ├── TaskNodeCard.tsx
│   │   │   ├── NodeDetailDrawer.tsx
│   │   │   └── Breadcrumbs.tsx
│   │   └── ui/                              # shadcn/ui wrappers
│   │
│   ├── hooks/useSocket.ts                   # Socket.io event bindings → orchestraStore
│   ├── stores/
│   │   ├── orchestraStore.ts                # Conv state, messages, clarifications, logs, history
│   │   └── workflowStore.ts                 # Workflow nodes + selected node
│   └── lib/                                 # socket.ts / api.ts / utils.ts
│
└── backend/                                 # Python FastAPI + python-socketio (ASGI)
    ├── main.py
    ├── socket_manager.py
    ├── database.py
    ├── config.py
    ├── models/                              # Pydantic API models + SQLAlchemy ORM
    ├── services/                            # Current agents + future Harness/Tool/CUA layers
    │   ├── conversation_manager.py
    │   ├── orchestrator_agent.py
    │   ├── clarifier_agent.py
    │   ├── workflow_designer.py
    │   ├── workflow_db.py
    │   ├── observability/                   # (Phase 4.5)
    │   ├── checkpoint/                      # (Phase 4.5)
    │   ├── approval/                        # (Phase 4.5)
    │   ├── tools/                           # (Phase 5-6) web_search / web_fetch / multimodal_preprocess / registry
    │   ├── executor/                        # (Phase 6) sandbox / evaluator / node_executor
    │   └── cua/                             # (Phase 7-8) perception / action / planner / safety / lifecycle
    ├── routers/                             # REST endpoints
    ├── prompts/                             # System prompt markdown files
    ├── browser/                             # Playwright automation scaffold (migrated into services/tools in Phase 5)
    └── tests/                               # pytest suites
```

---

## API Reference

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/health` | Health check |
| GET | `/api/workflow/{id}` | Get workflow by ID |
| GET | `/api/workflows` | List workflows (Phase 4) |
| PATCH | `/api/workflow/{id}/node/{node_id}` | Update node AI model |
| POST | `/api/execution/run/{workflow_id}` | Execute workflow (Phase 6) |
| POST | `/api/execution/node/{node_id}/retry` | Retry a failed node (Phase 6) |
| POST | `/api/sessions/{id}/resume` | Resume from checkpoint (Phase 4.5) |

**Socket.io Events (key)**

| Direction | Event | Purpose |
| --- | --- | --- |
| Client → Server | `chat_send` | Send a message |
| Client → Server | `chat_confirm_start` | Confirm plan, trigger generation |
| Client → Server | `execution:approve` | Approve / deny a pending action (Phase 4.5) |
| Client → Server | `execution:kill` | Kill switch — stop current session (Phase 4.5) |
| Server → Client | `chat:stream_token` | Streaming AI response token |
| Server → Client | `clarification:update` | New clarification questions |
| Server → Client | `clarification:plan_ready` | Plan ready for user approval |
| Server → Client | `building:log` | Agent activity log entry |
| Server → Client | `workflow:ready` | Workflow generated and saved |
| Server → Client | `execution:approval_required` | Blocked on human approval (Phase 4.5) |
| Server → Client | `execution:trace` | Tool / LLM call span (Phase 4.5) |

---

## Development Status

The project is being built in phases. Current status (2026-04-23):

- **Infrastructure** ✅ — Docker Compose, PostgreSQL, FastAPI, Socket.io, Next.js app shell
- **UI shell** ✅ — All pages and components built with placeholder data
- **AI orchestration** ✅ — Phase 3 wired end-to-end: `chat_send → clarifier → plan_ready → chat_confirm_start → workflow_designer → building:log → workflow:ready`. `/workflows` canvas auto-populates; Building Process panel shows per-node agent cards.
- **Design system v2** ✅ — Phase 2.6 (2026-04-21): 5-level surfaces, warm-tinted hairlines, 8-stop brand palette, unified radius/elevation/typescale, glass utilities, grain texture, soft-pulse motion, `prefers-reduced-motion` support. Legacy `components/workflow/` and `components/chat/` reduced to `@deprecated` stubs.
- **Workflow canvas data flow** 🔲 Phase 4 (next) — list page, detail page, live node status, breadcrumb routing.
- **Agent Harness Foundation** 🔲 Phase 4.5 — structured logging, execution tracing, checkpoint & resume, HITL approval gate, context compaction.
- **Universal Web Perception** 🔲 Phase 5 — unified search + fetch + multimodal preprocess (video / audio / 3D / Office).
- **Tool Registry + Node Executor** 🔲 Phase 6 — multi-model tool calling, Docker sandbox, separate evaluator agent.
- **Computer Use Agent** 🔲 Phase 7-8 — desktop perception (screenshot + UIA + OCR), action layer (pywinauto + pyautogui), planner-executor loop, safety + HITL, application lifecycle management, replay & kill switch.
- **Experience polish** 🔲 Phase 10-11 — sub-chat per node, file repository, multi-AI fan-out, bilingual, marketplace/arena real data.

See `Documents/project-overview.md` and `Documents/phase-history-and-handoff.md` for the complete roadmap, architectural decisions, and Harness Engineering laws that govern every phase.

---

## License

See `LICENSE` (if present) or contact the maintainers.
