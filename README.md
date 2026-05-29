# OrchestrAI

**An AI workflow orchestration platform built for real desktop tasks — not just chatting with an AI.**

Describe any goal in natural language, and OrchestrAI breaks it down into a structured visual workflow, picks the right AI model for each step, runs it across the browser / filesystem / desktop, and shows every move in real time. Think of it as a conductor for an orchestra of AI agents — each capable of picking up a real instrument on your computer.

---

## Why OrchestrAI

Most AI tools are single-turn: you ask, it answers. Real-world tasks aren't like that. Building software, running research, automating a repeatable process, or turning an image into a 3D model all require multiple steps, decisions, and tools working together — and sometimes require the AI to **actually operate the computer**.

OrchestrAI is built around four ideas:

- **Conversation before action** — the AI clarifies your intent before generating anything. You approve the plan, then it builds.
- **Universal perception** — agents can read any web page, video, audio, PDF, 3D file, or Office document. Multimodal is a first-class citizen, not an afterthought.
- **Real desktop reach** — agents don't stop at the browser. They launch applications, manage files, install programs, and automate desktop workflows (e.g., "clear my Genshin daily quests every morning", or "use the Tripo website to turn this image into a 3D model and open it in Blender").
- **Composable by design** — each workflow node can run a different AI model. Mix and match per task, swap models on the fly.

Everything runs inside a disciplined safety harness that keeps autonomous systems observable, recoverable, and pausable for human approval.

---

## Features at a Glance

- Natural-language → visual workflow generation, with multi-turn clarification before anything is built
- Real-time streaming AI responses and per-node progress
- Visual workflow canvas with per-node model selection, run / stop, edit, and one-click node subdivision
- DAG-aware node graph: parallel branches, explicit dependencies, phase / task hierarchy
- Workflow persistence — no work lost between sessions
- One-command Docker startup (database + backend + frontend)
- Warm-tinted design system with glass surfaces, layered elevation, and reduced-motion support

Some capabilities (universal web perception, computer-use agent, multi-AI fan-out, marketplace) are still under construction. See the phase roadmap in [`Documents/project-overview.md`](Documents/project-overview.md).

---

## How It Works (in 60 seconds)

```
You describe a goal
        ↓
The system identifies whether it's a build request or casual chat
        ↓
A clarifying agent asks targeted questions to fill in the gaps
        ↓
You review and approve the proposed plan
        ↓
A designer agent generates a multi-step visual workflow
        ↓
Each node runs with its assigned model and tools
        ↓
Full log of every action, visible in real time
        ↓
High-risk actions pause for your approval
```

---

## Quick Start

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.

```bash
# 1. Clone and configure
git clone <repo-url>
cd OrchestrAI
cp backend/.env.example backend/.env
# Fill in ANTHROPIC_API_KEY in backend/.env (see Configuration below)

# 2. Start everything
docker compose up -d --build

# 3. Open http://localhost:3000
```

That's it. The database, the backend, and the frontend all start together. The first build takes ~2–3 minutes; subsequent starts are seconds.

### Stopping

```bash
docker compose down        # Stop containers, keep your workflow data
docker compose down -v     # Stop and wipe the database (destructive)
```

### Watching Logs

```bash
docker compose logs -f               # all services
docker compose logs -f backend       # just the backend
```

### Local Development (without Docker)

If you want hot-reload during development without rebuilding containers:

```bash
# Start only the database
docker compose up -d db

# Terminal 1 — Backend
cd backend
python -m venv venv && .\venv\Scripts\activate    # PowerShell on Windows
# or: source venv/bin/activate                    # macOS / Linux
pip install -r requirements.txt
uvicorn main:socket_app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
```

The frontend will be at [http://localhost:3000](http://localhost:3000), the backend at [http://localhost:8000](http://localhost:8000).

---

## Configuration

Edit `backend/.env` (copy from `backend/.env.example`):

```env
# Core LLM providers
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
DEEPSEEK_API_KEY=
GROK_API_KEY=

BRAVE_SEARCH_API_KEY=...
TAVILY_API_KEY=
EXA_API_KEY=
SERPAPI_API_KEY=

GITHUB_TOKEN=
FIGMA_ACCESS_TOKEN=
```

Use `backend/.env` as the single local place for backend-only secrets and future tool API keys. Without `ANTHROPIC_API_KEY`, workflow generation will not work. Other keys are optional until their corresponding provider ships.

Do not put provider API keys in `frontend/.env.local`. Frontend variables are browser-visible; only use that file for public URLs like `NEXT_PUBLIC_API_URL` or `NEXT_PUBLIC_SOCKET_URL`.

---

## What You'll See

- **`/dashboard`** — landing overview
- **`/orchestra`** — three-pane AI orchestration (this is where you talk to the system and approve plans)
- **`/workflows`** — list of all workflows you've generated
- **`/workflows/[id]`** — visual canvas for a single workflow (run nodes, swap models, subdivide phases, edit anything)

Try saying *"帮我创建一个建模工作流"* or *"help me build a weather dashboard"* in the Orchestra page to see the full clarify → plan → confirm → generate loop.

---

## Documentation

This repository contains three docs aimed at three different audiences. Pick whichever fits you:

| Document | Audience | Language |
|----------|----------|----------|
| **This `README.md`** | Everyone — what it is, how to start it, how to configure it | English |
| [`Documents/project-overview.md`](Documents/project-overview.md) | Project teammates — architecture, full file-by-file structure, every phase plan and status, design principles, Harness six dimensions | 中文 |
| [`Documents/phase-history-and-handoff.md`](Documents/phase-history-and-handoff.md) | The next AI agent picking up the project — archived phase decisions, current backlog, onboarding checklist | 中文 |

If you're a new teammate joining the codebase, start with [`Documents/project-overview.md`](Documents/project-overview.md) — particularly the **§5 Project Structure** section, which describes every file in the repo.

---

## Contributing

This project follows a strict CI pipeline (`.github/workflows/ci.yml`):

- `npx tsc --noEmit` — no TypeScript errors
- `npm run lint -- --quiet` — no ESLint warnings
- `npm run build` — production build must succeed
- `pytest tests -q` — all backend tests must pass

PRs into `main` must come from `develop`. PRs into `develop` are open.

---

## License

See `LICENSE` if present, or contact the maintainers.
