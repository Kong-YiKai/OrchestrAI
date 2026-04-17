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

| Feature | Status |
|---------|--------|
| Natural language → workflow generation | 🔲 In progress (Phase 3) |
| Multi-turn clarification before building | 🔲 In progress (Phase 3) |
| Real-time streaming AI responses | 🔲 In progress (Phase 3) |
| Visual workflow canvas (React Flow) | ✅ UI ready |
| Per-node AI model selection | ✅ UI ready |
| Node execution engine (API / Browser / Simulation) | 🔲 Phase 6 |
| Nested sub-chat per node | 🔲 Phase 5 |
| Multi-AI fan-out (Claude + GPT + Gemini) | 🔲 Phase 7 |
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

| Agent | Model | Role |
|-------|-------|------|
| Orchestrator | Claude Haiku 4.5 | Fast intent routing |
| Clarifier | Claude Sonnet 4.6 | Multi-turn clarification, plan generation |
| Workflow Designer | Claude Sonnet 4.6 | Workflow structure generation |
| Node Executor | Per-node configurable | Task execution (Phase 6) |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15 (Turbopack, App Router) |
| UI | Tailwind v4 + shadcn/ui |
| State | Zustand |
| Animation | Framer Motion |
| Workflow Canvas | @xyflow/react (React Flow) |
| Realtime | Socket.io |
| Backend | Python FastAPI + python-socketio (ASGI) |
| Database | PostgreSQL 16 + SQLAlchemy async + asyncpg |
| AI | Anthropic Claude, OpenAI GPT, Google Gemini |
| Browser Automation | Playwright (Phase 6) |
| Deployment | Docker Compose |

---

## Project Structure

```
OrchestrAI/
├── docker-compose.yml
│
├── frontend/                        # Next.js 15
│   ├── app/
│   │   ├── globals.css              # Design tokens (Tailwind v4)
│   │   └── (app)/                   # App shell route group
│   │       ├── dashboard/           # Landing page
│   │       ├── orchestra/           # Main AI orchestration UI (3-col)
│   │       └── workflows/           # Workflow canvas (React Flow)
│   ├── components/
│   │   ├── layout/                  # AppSidebar, TopBar
│   │   ├── orchestra/               # Chat, context panel, drill-in views
│   │   └── workflows/               # Canvas, node cards, detail drawer
│   ├── hooks/useSocket.ts
│   └── stores/                      # Zustand: chatStore, workflowStore, orchestraStore
│
└── backend/                         # Python FastAPI
    ├── main.py                      # Socket.io events + app entry
    ├── models/
    │   ├── workflow.py              # Pydantic API models
    │   ├── chat.py                  # Pydantic chat models + AI personas
    │   └── db.py                    # SQLAlchemy ORM models
    ├── services/
    │   ├── conversation_manager.py  # Session state machine
    │   ├── orchestrator_agent.py    # Intent routing (Haiku)
    │   ├── clarifier_agent.py       # Clarification + plan (Sonnet)
    │   ├── workflow_designer.py     # Workflow generation (Sonnet)
    │   ├── executor.py              # Node execution engine (Phase 6)
    │   └── workflow_db.py           # Workflow CRUD
    └── routers/
        ├── workflow.py              # /api/workflow/*
        ├── chat.py                  # /api/chat/*
        └── execution.py             # /api/execution/*
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/workflow/{id}` | Get workflow by ID |
| PATCH | `/api/workflow/{id}/node/{node_id}` | Update node AI model |
| POST | `/api/execution/run/{workflow_id}` | Execute workflow |
| POST | `/api/execution/node/{node_id}/retry` | Retry a failed node |

**Socket.io Events (key)**

| Direction | Event | Purpose |
|-----------|-------|---------|
| Client → Server | `chat_send` | Send a message |
| Client → Server | `chat_confirm_start` | Confirm plan, trigger generation |
| Server → Client | `chat:stream_token` | Streaming AI response token |
| Server → Client | `clarification:update` | New clarification questions |
| Server → Client | `clarification:plan_ready` | Plan ready for user approval |
| Server → Client | `building:log` | Agent activity log entry |
| Server → Client | `workflow:ready` | Workflow generated and saved |

---

## Development Status

The project is being built in phases. Current status:

- **Infrastructure** ✅ — Docker Compose, PostgreSQL, FastAPI, Socket.io, Next.js app shell
- **UI shell** ✅ — All pages and components built with placeholder data
- **AI orchestration** 🔲 — Connecting the conversation loop to real Claude API calls (Phase 3, in progress)
- **Workflow execution** 🔲 — Node-by-node execution engine with browser automation (Phase 6)

Full roadmap: [`docs/superpowers/plans/project-phases-overview.md`](docs/superpowers/plans/project-phases-overview.md)

---

## Troubleshooting

**Page won't load**
```bash
docker compose ps              # Check all 3 containers are running
curl http://localhost:8000/api/health  # Should return {"status":"ok"}
```

**Workflow not generating**
```bash
# Verify API key is set
cat backend/.env | grep ANTHROPIC
# Check backend logs
docker compose logs -f backend
```

**Port conflict**
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <pid> /F
```

**Reset everything**
```bash
docker compose down -v && docker compose up --build
```
