# OrchestrAI

> **Reform in progress — 2026-10-12:** R1 selected LibreChat + OrchestrAI UI and LangGraph. R2 has an independent workflow service, real database/queue recovery checks, and CI/CD code. Cloud deployment is not activated; production chat, attachments and research remain unfinished. Read [the project overview](Documents/project-overview.md) and [AGENTS.md](AGENTS.md) before development.

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

### R2 internal service verification

Requires Docker (Linux containers), Python 3.11+, and Node 24 for local dependency checks. No model API key is needed.

```bash
python scripts/test-services.py
python scripts/test-release.py
python scripts/check-repository.py
```

The first command builds separate API/worker runtime and test images, tests real PostgreSQL/Redis, checks HTTP approval/artifacts across container restarts, and verifies a backup in an isolated database. It stops only `orchestrai-r2-test` containers and retains their volumes. Credentials stay in ignored `deploy/.env.test`; test reports/backups in ignored `.artifacts/`.

Prepare fixed LibreChat/RAG sources and the OrchestrAI UI patch with `python scripts/prepare-upstreams.py`; generated `.build/` must not be committed. Production activation and limitations are in overview section 5.3.

### Existing prototype

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.

```bash
# 1. Clone and configure
git clone <repo-url>
cd OrchestrAI
cp backend/.env.example backend/.env
# Fill in DEEPSEEK_API_KEY in backend/.env (see Configuration below)

# 2. Start everything
docker compose up -d --build

# 3. Open http://localhost:3000
```

That's it. The database, the backend, and the frontend all start together. The first build takes ~2–3 minutes; subsequent starts are seconds.

### Stopping

```bash
docker compose down        # Stop containers, keep your workflow data
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
# Core conversation / workflow models
DEEPSEEK_API_KEY=your-deepseek-key
DEEPSEEK_PRIMARY_MODEL=deepseek-v4-pro
DEEPSEEK_FAST_MODEL=deepseek-flash

# Optional providers for future integrations and multimodal perception
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
GROK_API_KEY=

BRAVE_SEARCH_API_KEY=...
TAVILY_API_KEY=
WEB_SEARCH_PROVIDER=tavily
WEB_READ_PROVIDER=auto
EXA_API_KEY=
SERPAPI_API_KEY=
FIRECRAWL_API_KEY=
JINA_API_KEY=
BROWSERLESS_API_KEY=

GITHUB_TOKEN=
FIGMA_ACCESS_TOKEN=
```

Use `backend/.env` as the single local place for backend-only secrets and future tool API keys. `DEEPSEEK_API_KEY` is required for chat, clarification, and workflow generation; the former `ANTHROPIC_API_KEY` is no longer used for live calls. The high-capability `deepseek-v4-pro` model handles chat, clarification, and workflow design, while `deepseek-flash` handles lightweight routing and executor helper calls. The Anthropic Python SDK remains installed only as a transport for DeepSeek's Anthropic-compatible endpoint. After you add the key, restart the backend; `GET /api/health` reports `llm.configured` and the selected models without revealing the key.

For Phase 5.6-R1 web search/read, `TAVILY_API_KEY` is the minimum useful web search key. Tavily transient HTTP/network failures are retried; `BRAVE_SEARCH_API_KEY` and `EXA_API_KEY` are optional independent search fallbacks, used in that order. Without either key there is no independent search fallback. `JINA_API_KEY` enables authenticated Jina Reader fallback, and `FIRECRAWL_API_KEY` enables optional scrape fallback. Docker images install the matching Playwright Chromium runtime automatically. For local backend development, install it once with `backend\venv\Scripts\python.exe -m playwright install chromium`. `GET /api/health` reports registered perception providers and whether a local Playwright browser binary is present.

The Orchestra chat path now routes current/search-like casual questions and direct URL-reading requests through `PerceptionService.search/read` before DeepSeek answers. Direct links are normalized (including public GitHub blob URLs), checked against private/local network targets, quality-scored, and retried through the configured read provider chain when the first response is an SPA shell, challenge page, or empty content. On a TUN/Fake-IP network that maps hostnames to `198.18.0.0/15`, URL safety independently checks public DNS over HTTPS before allowing a hostname; literal Fake-IP, private/local addresses, and unverified names remain blocked. `WEB_DOH_RESOLVERS` in `backend/.env` configures the HTTPS DNS endpoints. Links sent during clarification are read as untrusted requirement context without resetting the workflow conversation. Workflow nodes still need Phase 6 ToolRegistry/NodeExecutor before they can call web tools automatically.

The Orchestra sidebar now loads real persisted conversations. **新建聊天** creates a separate session, **最近聊天** switches between sessions, and messages are restored after a page refresh or backend restart. The trash button asks for confirmation before permanently deleting that conversation's messages and checkpoint; a chat generating a workflow cannot be deleted until generation finishes. Workflows remain separate and are not deleted with the chat. Older checkpoints are imported into the message table when opened. This reuses the existing `agent_sessions` and `chat_messages` tables; no migration or new key is required.

When a public URL has been successfully read, its answer is generated without older conversation turns that may contain stale read failures. An answer that still falsely claims the read failed is withheld and retried once; if both drafts contradict the read result, chat reports an answer-generation problem rather than a URL safety failure. This specifically addresses the case where `/api/perception/read` succeeded under TUN but DeepSeek repeated an earlier failure from chat history. Switching TUN to system-proxy mode is not required for that case.

An access-control or risk-control page is not considered the requested article. For example, if Xiaohongshu redirects a public share link to its `website-login/error` page with an IP-risk message, the read is marked incomplete and chat reports that it has no reliable article text instead of inventing a summary. This is a site-side denial, not proof that Docker or TUN blocked the request. Assistant messages now render Markdown and long URLs without overflowing the chat bubble. These are reliability fixes, not a guarantee that login-gated or anti-bot content can be read.

For a focused manual acceptance check while Compose is running at `http://localhost:3000/orchestra`:

1. Ask “请阅读 https://www.python.org/about/ 并用中文概括” and verify the answer uses the page content rather than saying the URL is blocked. The backend read probe can be checked separately with `POST /api/perception/read` and `{"url":"https://www.python.org/about/"}`.
2. Ask for a current topic with “查一下…最新进展”; verify search results are used. If Tavily fails, inspect the returned provider/category/status diagnostics. To exercise **independent** fallback, fill `BRAVE_SEARCH_API_KEY` or `EXA_API_KEY` yourself in `backend/.env`, then run `docker compose up -d --force-recreate backend`.
3. Click **新建聊天**, send a short message, switch back to an older entry in **最近聊天**, then switch to the new entry. Refresh the page and confirm both titles and messages remain. Use the trash button on a disposable chat, cancel the first confirmation to verify nothing changes, then confirm deletion and verify the chat disappears and the remaining chat opens. The old hard-coded “3D Weather App / E-commerce API / Portfolio Website” entries should be gone.
4. Paste a link that redirects to a login/risk-control page, such as the Xiaohongshu link from the reported bug. Verify the assistant explicitly says it could not obtain the original content and does not summarize from a security warning. Check that paragraphs, Markdown lists, citations, and long URLs are readable in chat.

Search intent routing is still keyword-oriented, and this milestone does not add autonomous multi-query research, source cards, or workflow-node web tools.

Phase 5.7 adds `POST /api/perception/perceive` as a backend-only URL inspection endpoint. With the default `analyze: false`, send `{"url":"https://example.com"}` to receive readable page text, or a public file URL to receive asset metadata (`source_type`, final URL, content type, filename, and size when supplied). The default request does not download or parse binary content. For manual verification after starting the backend yourself in PowerShell:

```powershell
$body = @{ url = 'https://example.com' } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:8000/api/perception/perceive' -Method Post -ContentType 'application/json' -Body $body
```

For the combined Phase 5.7/5.8 check, repeat the default request with public PDF, image, Office (`.docx`, `.pptx`, `.xlsx`), short audio/video, and 3D (`.obj`, `.stl`, `.glb`) links. Inspect `source_type`, `assets`, `provider_chain`, and `errors`; private/local URLs must be rejected. Then opt into content analysis for a small public PDF or Office file:

```powershell
$body = @{ url = 'https://YOUR-PUBLIC-FILE-URL/example.pdf'; analyze = $true } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:8000/api/perception/perceive' -Method Post -ContentType 'application/json' -Body $body
```

With `analyze: true`, files are downloaded up to 10 MiB. PDF/Office text and 3D geometry are processed locally. Image, short audio/video, and scanned-PDF semantic analysis require `GOOGLE_API_KEY` in `backend/.env`; without it the response still contains metadata and an explicit `unavailable` error. The default model is `gemini-3.8-flash` (override with `GEMINI_PERCEPTION_MODEL`). Opting in sends supported media bytes to Google and can incur charges. This small-file path does not yet handle large media, website video extraction, ffmpeg/Whisper processing, or rendered 3D views.

As a separate existing-chat smoke check, paste a public article URL into `/orchestra` and ask the assistant to summarize it; that exercises the Phase 5.6-R1 `read()` bridge, not the new `/perceive` analysis path. Workflow nodes still need Phase 6 ToolRegistry/NodeExecutor before they can use web tools.

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

The project has one maintained overview and one repository rule entry point:

| Document | Audience | Language |
|----------|----------|----------|
| **This `README.md`** | Everyone — what it is, how to start it, how to configure it | English |
| [`Documents/project-overview.md`](Documents/project-overview.md) | Current status, reform phases, selected technologies, service boundaries, deployment plan, validation, and next task | 中文 |
| [`AGENTS.md`](AGENTS.md) | Mandatory onboarding, reuse/removal rules, validation, and documentation updates | 中文 |

Every new development task or AI conversation must begin by reading the overview and repository rules. `Documents/` contains only the overview; update it after every change instead of adding a separate handoff document.

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
