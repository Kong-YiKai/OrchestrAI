# OrchestrAI — 项目总览（团队上手文档）

> **读者**：要一起开发本项目的同事。读完这一份你应该能回答：项目要解决什么问题、当前可用的能力、整体架构、每个文件的职责、每个 Phase 已经做了什么和下一步要做什么。
>
> **建议阅读顺序**：§0 速览 → §1 Phase 路线图 → §2 技术栈 → §3 路由结构 → §4 核心架构决策 → §5 **Project Structure**（重点）→ §6 Harness Engineering 六维度铁律 → §7 开发与验证。
>
> **最新状态锚点（2026-05-19）**：Phase 4.5 前置补强已完成。画布支持整图 mock Run、单节点 Run/Stop、节点内容编辑、DAG 依赖字段（`node_type` / `parent_node_id` / `depends_on` / `parallel_group`）、按依赖绘制 React Flow 边、`Subdivide` 把阶段节点拆为带并行实现分支的子任务。生成 prompt 改为阶段级规划 + 并行依赖表达。**下一步是 Phase 4.5 正式 Harness Foundation**：结构化日志、执行追踪、checkpoint & resume、HITL approval gate、context compaction。

---

## 0. 速览（30 秒理解项目）

**OrchestrAI** = 一个**面向真实桌面任务**的 AI 工作流编排平台。用户用自然语言描述目标 → Orchestrator(Haiku) 识别意图 → Clarifier(Sonnet) 多轮澄清 → 用户 confirm → WorkflowDesigner 生成可视化工作流（React Flow 画布）→ 每个节点可配 Claude / GPT / Gemini / DeepSeek 等不同模型 → 节点执行时可调用浏览器自动化、本地桌面操作、文件系统、进程控制等工具。

**目标能力范围**：从"帮我做一份 PPT"这种纯 AI 任务，到"每天定时自动清原神日常"或"让 AI 打开浏览器用 Tripo 网站帮我把图片转成 3D 模型"这种**需要操控真实 Windows 桌面**的任务。

**当前可用路径**：

- `/dashboard`（落地页 / 项目概览）
- `/orchestra`（三栏 AI 编排，核心功能）
- `/workflows`（列表）/ `/workflows/[id]`（画布详情）
- `/marketplace` / `/arena` / `/team` / `/settings`（占位，Phase 11）

**视觉**：暖色设计系统（牛奶咖色 canvas + 琥珀橘 brand），"编排交响乐团"的视觉隐喻。

---

## 1. Phase 路线图

### 1.1 设计哲学：5 层 Tier

| Tier | 名称 | 定位 |
|------|------|------|
| A | UI 闭环 | 让 Phase 3 产出的工作流能从对话端走到画布端，跑通最短路径 |
| B | Agent Harness 基础设施 | 横切所有后续 Phase 的可观测 / 可恢复 / 可审批基座 |
| C | 感知与工具 | 让 agent 有"眼睛"（万能 web 感知）和"手"（统一工具 registry + 执行引擎） |
| D | Computer Use Agent | 让 agent 有"身体"——操控真实 Windows 桌面 |
| E | 体验打磨 | Sub-chat、多 AI 扇出、双语、Marketplace 真实化 |

### 1.2 Phase 状态总览

| Phase | Tier | 名称 | 状态 | 核心交付 |
|-------|------|------|------|---------|
| 1 | 前置 | 核心脚手架 + 分屏布局 | ✅ | Next.js + FastAPI + Socket.io + Zustand + React Flow |
| 1.5 | 前置 | Docker Compose + DB 基础设施 | ✅ | PostgreSQL 16 + async SQLAlchemy + Docker 一键启动 |
| 2 | 前置 | 设计系统 v1 + App Shell | ✅ | 暖色主题 + AppSidebar/TopBar + 3 路由骨架 |
| 2.5 | 前置 | Orchestra Context Panel 重构 | ✅ | drill-in 导航 + View union（2026-04-17） |
| 3 | 前置 | The Orchestra 功能接线 | ✅ | Chat → Clarify → Confirm → 生成工作流，3 Agent 架构，端到端打通 |
| 2.6 | 前置 | 前端清理 + 视觉质感升级 | ✅ | 设计 token v2，12 核心组件升级（2026-04-21） |
| **4** | **A** | **Workflows 画布功能接线** | ✅ | Stub 清理 / `/workflows` 列表 + `[id]` 详情 / Orchestra → Canvas CTA / NodeDetailDrawer 双 tab / canvas Run + mock 执行事件链 / Clarifications drill-in 重构 |
| **4.5-pre** | **B 前置** | **Canvas 节点控制 + DAG 细分** | ✅ | 大面板 NodeDetailDrawer / 节点级 Run/Stop / 节点字段编辑 / `depends_on` DAG 边 / `parallel_group` 并行标记 / `Subdivide` 确定性生成阶段子任务 |
| **4.5** | **B** | **Agent Harness Foundation** | 🔲 **next** | 结构化日志 + 执行追踪 + checkpoint & resume + HITL approval 框架 + context compaction |
| **5** | **C** | **Universal Web Perception** | 🔲 | Search 层（Tavily + Brave）+ Fetch 两档（HTTP / Playwright）+ 多模态预处理（视频/音频/3D/Office）+ 统一产出结构 |
| **6** | **C** | **Tool Registry + Node Executor** | 🔲 | 多模型 tool-calling 适配层 + Docker sandbox + 生成/评估分离的验证循环 + Linter/测试作为确定性约束 |
| **7** | **D** | **CUA MVP（桌面感知 + 基础动作）** | 🔲 | `mss` 截图 + UIA 树 + OCR + `pywinauto`/`pyautogui` + Planner-Executor loop + 首版 capability scoping & audit |
| **8** | **D** | **CUA 扩展（应用生命周期 + 跨应用流程）** | 🔲 | 软件安装/卸载、进程管理、Replay & Kill Switch、完整 HITL approval gate |
| **10** | **E** | Sub-chat 分叉 + File Repository | 🔲 | 节点内 Sub-chat、Building Log 点击展开 |
| **11** | **E** | 多 AI 扇出 + 双语 + 市场真实化 | 🔲 | GPT/Gemini 扇出、中英双语、Marketplace/Arena 真实数据 |

> **关于游戏场景**：Phase 7/8 的 CUA 覆盖"启动游戏 / 操作菜单 / 执行脚本化动作"这种级别的任务（如"每天自动清原神日常"）。完整的**游戏 AI（low-latency vision-based game-playing）不列独立 Phase**，那是用户自己在工作流里拼装的高级用法，我们只提供通用 CUA 基础能力，不为游戏做特化。

### 1.3 Phase 间依赖关系

```
Phase 4（UI 闭环）───┐
                    ├──► Phase 4.5（Harness 基座，横切）
                    │         │
                    │         ▼
                    │     Phase 5（万能 Web 感知）───► Phase 6（Tool Registry + 执行引擎）
                    │                                      │
                    │                                      ▼
                    │                              Phase 7（CUA MVP）───► Phase 8（CUA 扩展）
                    │                                                       │
                    └───────────────────────────────────────────────────────┴──► Phase 10 / 11（体验打磨）
```

---

## 2. 技术栈

### 2.1 核心栈（已落地）

| 层级 | 技术 |
|------|------|
| 前端框架 | Next.js 16（App Router，Turbopack） |
| UI 库 | Tailwind v4 + shadcn/ui + @base-ui/react |
| 状态管理 | Zustand（`orchestraStore` / `workflowStore`） |
| 动画 | Framer Motion |
| 节点图 | @xyflow/react（React Flow 12.x） |
| 拖拽 | @dnd-kit/core + @dnd-kit/sortable |
| 实时通信 | socket.io-client（前端）+ python-socketio ASGI（后端） |
| Markdown | react-markdown |
| 图标 | lucide-react |
| 字体 | Inter（next/font） |
| 后端框架 | Python FastAPI + Uvicorn |
| 数据库 | PostgreSQL 16 + SQLAlchemy 2.0 async + asyncpg |
| AI（结构化 reasoning） | Anthropic Claude（Haiku 4.5 / Sonnet 4.6 / Opus） |
| 浏览器自动化（预留） | Playwright（Python，Phase 6 启用） |
| 容器化 | Docker Compose（db + backend + frontend） |
| CI | GitHub Actions（tsc + eslint + next build + pytest） |

### 2.2 扩展栈（Phase 4.5 起逐步引入）

| 层级 | 技术 | 引入 Phase |
|------|------|-----------|
| 结构化日志 | `structlog`（主）或 `loguru` | 4.5 |
| Tracing | OpenTelemetry + Jaeger（可选） | 4.5 |
| Checkpoint 存储 | PostgreSQL `agent_sessions` 表（state + cursor + trajectory） | 4.5 |
| HITL Approval | 自研 approval gate service + 前端 approval window | 4.5 |
| AI（多模态兜底） | **Google Gemini 2.x**（视频 / 音频 / 图片 / PDF 全原生，首选兜底） | 5 |
| AI（中文场景可选） | 字节豆包多模态 | 5 |
| AI（备选） | OpenAI GPT, DeepSeek | 5 |
| Web Search Provider | **Tavily**（主）+ **Brave Search API**（备，低成本 fallback）+ **Exa**（语义搜索） | 5 |
| 网页抓取 | `httpx`（静态 HTML）+ **Playwright**（动态 / SPA / 股票图表 / 仪表盘） | 5 |
| 网页解析 | **Trafilatura**（正文提取）+ **Jina Reader**（`r.jina.ai`，fallback） | 5 |
| 视频处理 | **`yt-dlp`**（下载，覆盖 1800+ 站点）+ `ffmpeg`（抽关键帧）+ **OpenAI Whisper**（转录） | 5 |
| 音频处理 | Whisper（本地 or API）；Gemini 2.x 直接吃作为 fallback | 5 |
| 3D 文件处理 | `trimesh` + `pyrender`（多视角渲染 → 图片 → VLM 理解） | 5 |
| Office 文档 | `mammoth`（docx）+ `python-pptx`（pptx）+ `openpyxl`（xlsx） | 5 |
| Tool Calling 适配 | 自研 `ToolRegistry` + 各模型 tool schema 转换层 | 6 |
| Sandbox | Docker（每节点一个容器） | 6 |
| Evaluator | 独立 Sonnet/GPT 实例，与生成 agent 分离 | 6 |
| 桌面截图 | `mss`（跨平台高性能快照） | 7 |
| 桌面 UI 树 | **Microsoft UI Automation** via `uiautomation` / `pywinauto` | 7 |
| OCR | **PaddleOCR**（准，中英文都好）或 Tesseract（轻） | 7 |
| 输入模拟 | `pywinauto`（semantic，UIA actions）+ `pyautogui`（pixel fallback） | 7 |
| 进程 / 系统 | `subprocess` + PowerShell + Win32 API via `pywin32` | 8 |
| Replay & Kill Switch | 自研 action log + `psutil` 进程管理 | 8 |

---

## 3. 路由结构

```
/ → redirect → /dashboard

/dashboard          落地页，项目概览
/orchestra          The Orchestra：三栏 AI 编排（核心功能）
/workflows          Workflows 列表（grid）
/workflows/[id]     Workflows 画布详情页
/marketplace        占位（Phase 11）
/arena              占位（Phase 11）
/team               占位（Phase 11）
/settings           占位（Phase 11）
```

后端 API 前缀：所有 router 挂在 `/api` 下。Socket.io 直接挂在根路径（由 `socket_app = socketio.ASGIApp(sio, other_asgi_app=app)` 包裹 FastAPI app 提供）。

---

## 4. 核心架构决策

### 4.1 三 Agent 模型（现状）

| Agent | 模型 | 触发时机 | 职责 |
|-------|------|---------|------|
| Orchestrator | Haiku 4.5 | 每次 `chat_send` 的第一个调用 | intent 二分：`casual_chat` / `development_request` |
| Clarifier | Sonnet 4.6 | 识别为 `development_request` 后 | 多轮提问 → 聚合 → 生成 plan（`clarification:plan_ready`） |
| Workflow Designer | Sonnet 4.6 | 用户 `chat_confirm_start` 后 | 生成工作流 JSON，流式下发 `building:log`，最后 `workflow:ready` |

### 4.2 节点执行 Agent 家族（Phase 6+ 逐步引入）

| 角色 | 说明 | 引入 Phase |
|------|------|-----------|
| Node Executor | 按节点配置的模型调用 + 工具调用，含 sandbox 隔离 | 6 |
| Perception Agent | 专职 Web Search / 网页 fetch / 多模态预处理 | 5 |
| Desktop Agent | 专职 Computer Use，隔离在独立进程 / VM | 7 |
| Evaluator Agent | 独立评估节点输出质量，与生成 agent 分离 | 6 |

### 4.3 ConversationState 状态机

```
idle → clarifying → awaiting_confirm → generating → complete
           ↑                ↓
           └─ re-ask ←──────┘
```

**Phase 4.5 起**会持久化到 DB（`agent_sessions` 表），支持 **checkpoint & resume**——任务失败 / 进程崩溃 / 用户半道退出都能从断点续跑。

### 4.4 Socket.io 事件契约

```
Client → Server（已有）
  chat_send              { session_id, content }
  chat_confirm_start     { session_id }
  join_session           { session_id }

Client → Server（Phase 4.5 新增）
  execution:approve      { approval_id, decision: "approve" | "deny" | "modify", note? }
  execution:kill         { session_id }

Server → Client（已有）
  chat:stream_start / token / end
  chat:message
  clarification:update / plan_ready
  building:started / log / complete
  workflow:ready
  workflow:node_appeared / generation_complete
  history:update
  execution:node_started      { node_id, workflow_id }
  execution:node_log          { node_id, log_line }
  execution:node_complete     { node_id, result: NodeResult, execution_method }
  execution:node_error        { node_id, error }
  execution:node_stopping     { node_id }
  execution:node_stopped      { node_id, reason }
  execution:workflow_complete { workflow_id }

Server → Client（Phase 4.5 新增）
  execution:approval_required  { approval_id, action, risk_level, context }
  execution:trace              { span_id, agent, input_summary, output_summary, duration_ms }
  execution:checkpoint         { session_id, step, resumable_at }
```

### 4.5 其它关键决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 工具层是否做成 MCP | **内部 service 为主**，必要时包 MCP wrapper | 项目内部 node executor 直接调 service 最简单；MCP 价值在"给外部 agent 用"，不是我们首要目标 |
| 多模态兜底模型 | **Gemini 2.x** | 原生支持视频 / 音频 / 长上下文（数小时视频），覆盖面最大；豆包作中文特别重的场景可选 |
| 3D 文件理解 | **多视角渲染 → 图片 → VLM** | 主流 LLM 都不吃 `.obj/.gltf/.fbx`；Tripo/Meshy/Rodin 是生成型不是理解型；PointLLM/3D-LLM 是学术工具不成熟 |
| Sandbox 粒度 | 节点级 Docker（Phase 6），CUA 用独立 Windows VM / 独立进程（Phase 7） | 平衡隔离性与启动开销 |
| Checkpoint 存储 | PostgreSQL `agent_sessions` 表 | 复用已有 DB，无需引入 Redis |
| 工作流确认流程 | **永远先澄清再确认**，不自动生成 | 用户掌控感，避免错误工作流 |
| DB 持久化（Phase 4.5 后） | Workflow + ChatMessage + **AgentSession** + **ExecutionTrace** + **ApprovalRecord** | 支持 checkpoint / resume / replay / audit |

### 4.6 设计系统铁律（Phase 2.6 起）

- **绝不回到 v1 的单色 hairline**，统一用 `border-hairline` / `border-hairline-strong`
- **不再用 Tailwind 原生 `shadow-sm/md/lg`**，全部用 `shadow-card/card-md/elevated/floating/overlay`
- **圆角只用 4 档**：`rounded-[8px|12px|16px|20px]` 或 `rounded-sm/md/lg/xl`
- **动画优先 `soft-pulse`，不用 `ping`**（后者视觉过锐）
- **玻璃面板**：`bg-glass` 用大面积（sidebar 等），`bg-glass-surface` 用浮层（drawer 等）

---

## 5. Project Structure（文件结构 · L3 粒度）

> **覆盖原则**：仓库根、`backend/` 根、`frontend/` 根的**每一个文件**都列出来；`backend/{models,routers,services,prompts,tests,browser}/` 的每一个源文件、`frontend/{app,components,hooks,lib,stores,types,public}/` 的每一个源文件都列出来。`node_modules/` / `.next/` / `__pycache__/` / `venv/` / `.pytest_cache/` 这类生成物只列目录、不展开。
>
> **怎么用**：每次接手新需求前先在这里定位涉及的文件；改动后顺手回到这里更新对应行的描述。

### 5.1 仓库根

```
OrchestrAI/
├── backend/                  # FastAPI + Socket.io + PostgreSQL（详见 §5.2）
├── frontend/                 # Next.js 16 App Router 应用（详见 §5.3）
├── Documents/                # 项目文档（本文件所在的目录，详见 §5.4）
├── scripts/                  # 运维与脚本
├── .github/                  # GitHub Actions CI
├── .git/                     # Git 元数据
├── .gitignore
├── docker-compose.yml
└── README.md
```

| 路径 | 职责 |
|------|------|
| `.gitignore` | 忽略 `__pycache__`、`backend/venv/`、`frontend/node_modules`、`frontend/.next`、`.env*`、IDE/OS 临时文件、`pgdata/`、`.superpowers/`、AI assistant 本地设置（`.claude/` / `.cursor/`）、AI 上下文备份（`CLAUDE.md`） |
| `docker-compose.yml` | 三 service 编排：`db`（postgres:16-alpine + `pgdata` 卷 + 健康检查）、`backend`（构建 `backend/`，挂 8000，依赖 db healthy）、`frontend`（构建 `frontend/`，挂 3000，注入 `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_SOCKET_URL`） |
| `README.md` | 项目对外门面：项目介绍 + Quick Start + 配置说明 + 文档导航。**非技术内容**，给所有人看 |

#### 5.1.1 `Documents/`

| 文件 | 受众 | 职责 |
|------|------|------|
| `Documents/project-overview.md`（本文件） | 项目同事 | 总览 + Phase 路线图 + 技术栈 + 架构决策 + **文件索引** + Harness 六维度 + 开发指南 |
| `Documents/phase-history-and-handoff.md` | 下一个 AI agent | Phase 归档 + 下一个 Agent 任务清单（按 Tier A→E 分层）+ 交接 checklist |

#### 5.1.2 `scripts/`

| 文件 | 职责 |
|------|------|
| `scripts/docker-clean.sh` | bash 工具：清理 dangling 镜像 + 删除旧命名（`orchestrai-*` / `docker-frontend` / `docker-backend`）的过期镜像，最后列出当前所有镜像。手动跑，CI 不调用 |

#### 5.1.3 `.github/`

| 文件 | 职责 |
|------|------|
| `.github/workflows/ci.yml` | GitHub Actions：三 job —— `main-source-guard`（禁止非 develop 分支直接 PR main）/ `frontend`（npm ci + tsc + eslint + next build）/ `backend`（pip install + pytest）。触发：PR to main/develop、push to develop、workflow_dispatch |

---

### 5.2 `backend/`（Python FastAPI · Socket.io · PostgreSQL）

```
backend/
├── browser/             # Playwright 浏览器池（Phase 6 才真正启用）
├── models/              # Pydantic 数据模型 + SQLAlchemy ORM
├── prompts/             # 三个核心 agent 的 system prompt（独立 .md 便于热更）
├── routers/             # FastAPI REST endpoint
├── services/            # 业务逻辑 / agent 实现 / DB helper
├── tests/               # pytest 异步测试
├── venv/                # Python 虚拟环境（gitignored）
├── __pycache__/         # 字节码缓存（gitignored）
├── .pytest_cache/       # pytest 缓存（gitignored）
├── .dockerignore
├── .env / .env.example
├── config.py
├── database.py
├── Dockerfile
├── main.py
├── requirements.txt
└── socket_manager.py
```

#### 5.2.1 backend 根文件

| 文件 | 职责 |
|------|------|
| `backend/.dockerignore` | 排除 `venv/` `__pycache__/` `*.pyc` `.env` `.git`，缩小 build context |
| `backend/.env.example` | 范例环境变量：`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY` / `CORS_ORIGINS` / `MAX_PLAYWRIGHT_BROWSERS` / `DATABASE_URL`。新人 `cp .env.example .env` 后填 key |
| `backend/.env` | 真实运行配置（gitignored；docker-compose 通过 `env_file` 注入到 backend container） |
| `backend/config.py` | `Settings(BaseSettings)`：用 pydantic-settings 从 `.env` 读 7 个字段；暴露 `settings.cors_origins_list` 属性把逗号串切成 list |
| `backend/database.py` | SQLAlchemy async：`create_async_engine` + `async_sessionmaker` + `Base = DeclarativeBase` + `init_db()`（启动时 `create_all`）/ `shutdown_db()`（dispose）/ `get_session()` 依赖注入 |
| `backend/Dockerfile` | 多阶段构建：`python:3.12-slim` builder（含 gcc / libpq-dev 编译 wheel）→ runtime（仅装 libpq5）。playwright chromium 安装行注释保留，等 Phase 6 解开。`CMD uvicorn main:socket_app --host 0.0.0.0 --port 8000` |
| `backend/main.py` | FastAPI + Socket.io ASGI 入口：`lifespan` 调 `init_db` / `shutdown_db`；CORS；挂 4 个 router；定义 Socket.io 事件 `chat_send`（驱动 ConversationState 状态机）/ `chat_confirm_start`（触发 WorkflowDesigner）；最后用 `socketio.ASGIApp` 把 sio 和 FastAPI 包成单一 ASGI app |
| `backend/requirements.txt` | 钉版本：fastapi 0.135、uvicorn 0.44、python-socketio 5.16、pydantic 2.13、sqlalchemy[asyncio] 2.0.41、asyncpg 0.30、anthropic 0.95、httpx 0.28、playwright 1.58、python-dotenv 1.1 |
| `backend/socket_manager.py` | 单例 `sio = AsyncServer(async_mode="asgi")` + `sessions: dict[str, set]` 内存映射 + `connect / disconnect / join_session` 三个默认事件。其它模块用 `from socket_manager import sio` 复用 |

#### 5.2.2 `backend/browser/`

| 文件 | 职责 |
|------|------|
| `backend/browser/__init__.py` | 空，标记 package |
| `backend/browser/pool.py` | `BrowserPool` 单例：`Semaphore(3)` 限并发、`async_playwright().start()` 启动、`acquire() / release()` 借还 Chromium 实例。**Phase 6 才被 executor 真正调用**，Dockerfile 里 `playwright install` 仍注释着 |
| `backend/browser/automations/__init__.py` | 空目录占位，未来放具体网站的自动化脚本（Tripo / Genshin 等） |

#### 5.2.3 `backend/models/`

| 文件 | 职责 |
|------|------|
| `backend/models/__init__.py` | 空，标记 package |
| `backend/models/chat.py` | Pydantic 模型：`MessageType` enum、`AISender`、`ChatMessage`（含 `is_streaming`、`workflow_ref`）、`ClarificationOption`、`ClarificationQuestion`（pending/answered）、`PlanNode`、`PlanPayload`、`BuildingLog`（7 种 type）、`HistoryEntry`；末尾 `AI_PERSONAS` 字典固化 5 个角色（claude / gpt / gemini / grok / orchestrai） |
| `backend/models/db.py` | SQLAlchemy ORM：`WorkflowRecord`（`workflow_id` PK + `session_id` 索引 + `title` / `title_zh` / `description` / `nodes` JSONB + `created_at`），`ChatMessageRecord`（`message_id` PK + `session_id` 索引 + `sender_id` + `content` + `message_type` + `workflow_ref` + `created_at`）。节点不开独立表，整组 JSONB 存在 workflow 行里 |
| `backend/models/workflow.py` | 核心数据模型：5 个 enum（`NodeStatus` / `ExecutionMethod` / `ToolType` / `NodeType`）+ `NodeResult` / `WorkflowNode`（含 DAG 字段 `node_type` / `parent_node_id` / `depends_on` / `parallel_group`）/ `Workflow` |

#### 5.2.4 `backend/prompts/`

| 文件 | 职责 |
|------|------|
| `backend/prompts/orchestrator_system.md` | Orchestrator agent system prompt：让 Haiku 二分 `casual_chat` / `development_request`，输出 JSON `{"route", "brief_reason"}` |
| `backend/prompts/clarifier_system.md` | Clarifier agent system prompt：多轮澄清规则；要求每条提问带 hint + options；信息够了再切 `present_plan`；超出 AI 实现能力的产品要引导到 MVP / 模拟 / 分阶段 |
| `backend/prompts/workflow_designer_system.md` | Workflow Designer system prompt：阶段级（4-8）节点 + 允许并行依赖；JSON 用 `<workflow_json>` 包裹；包含所有 `WorkflowNode` 字段（含 DAG 关系） |

#### 5.2.5 `backend/routers/`

| 文件 | 职责 |
|------|------|
| `backend/routers/__init__.py` | 空，标记 package |
| `backend/routers/chat.py` | `POST /api/chat/message`（HTTP fallback；主流程走 Socket.io 的 `chat_send`） |
| `backend/routers/execution.py` | 执行控制：`POST /api/execution/run/{workflow_id}`（整图运行，`RunRequest.mock` 切真/假）；`POST /api/execution/node/{node_id}/run`（单节点）；`POST /api/execution/node/{node_id}/stop`（写 cancel registry + emit `execution:node_stopping`）；`POST /api/execution/node/{node_id}/retry`；运行结束自动 `update_workflow_nodes` 持久化结果 |
| `backend/routers/workflow.py` | 单工作流 CRUD（注意单数）：`GET /api/workflow/{id}` 读全量；`PATCH /api/workflow/{id}/node/{node_id}` 改字段（`EDITABLE_NODE_FIELDS` 白名单 + `tool_type` / `node_type` enum 校验）；`POST /api/workflow/{id}/node/{node_id}/subdivide` 把阶段拆为子任务 |
| `backend/routers/workflows.py` | 工作流集合（复数）：`GET /api/workflows` 返回 `list[WorkflowSummary]`（不含节点 payload，按 `created_at` 倒序），给列表页用 |

#### 5.2.6 `backend/services/`

| 文件 | 职责 |
|------|------|
| `backend/services/__init__.py` | 空，标记 package |
| `backend/services/clarifier_agent.py` | `clarify(session_id, user_message, state, sio_emit)`：调 Sonnet 4.6 stream → `_extract_json` 抽响应 → `_normalize_response` 兜底字段 → 写 `add_clarification` / `set_plan` / `add_history_log` → emit `clarification:update` 或 `clarification:plan_ready`。`_record_answers_from_user_message` 解析 `Q:/A:` 格式回填；`_build_deterministic_plan_response` 在所有问题都已回答时绕过 LLM 直接给阶段级 6 节点 plan |
| `backend/services/conversation_manager.py` | `ConversationState` dataclass（`state` / `history` / `clarifications` / `plan_summary` / `plan_nodes_preview` / `original_request` / `history_log`）+ per-session 内存 dict `conversation_states`；提供 `get_state` / `reset_state` / `append_history` / `add_clarification` / `answer_clarification` / `set_plan` / `add_history_log` |
| `backend/services/execution_control.py` | Phase 4.5 前置：`ExecutionControl` dataclass + 内存 set `_cancelled_nodes`，方法 `request_node_cancel` / `clear_node_cancel` / `is_node_cancelled`。**Phase 4.5 正式版会替换为持久化的 task registry** |
| `backend/services/executor.py` | `NodeExecutor`：构造时接收 `session_id` 和 `mock: bool`；`execute_workflow` 顺序跑；`execute_node` 三档兜底（api → playwright → claude simulated）+ 每段加 `_log` 触发 `execution:node_log`；`_execute_node_mock` 按 `tool_type` 输出 staged 事件（api / web_automation / llm 三套日志模板）；`_api_execute` 内含 wttr.in 天气调用作为 demo；`_playwright_execute` 让 Haiku 生成脚本再 exec 到 BrowserPool 拿到的 page。模块顶层常量 `MOCK_LOG_DELAY = 0.25` / `MOCK_BETWEEN_NODES = 0.10` 控制 mock 节奏 |
| `backend/services/orchestrator_agent.py` | `route_message(user_message, history)`：先 `_looks_like_development_request` 跑确定性关键字匹配（`DEV_HINTS` 含 28 个中英词、`CASUAL_ONLY_HINTS` 含 6 个）；没命中再调 Haiku 4.5 + `orchestrator_system.md` 兜底，失败 fallback 到 `casual_chat` |
| `backend/services/workflow_db.py` | Workflow DB helper：`save_workflow` / `load_workflow` / `load_all_workflows` / `update_workflow_nodes`；`_coerce_created_at` 把 LLM 给的 ISO 字符串转回 DateTime（asyncpg/SQLite 不收字符串）；`_record_to_workflow` 反向把 DB 行还原为 Pydantic |
| `backend/services/workflow_designer.py` | `design_workflow(session_id, state, sio_emit)`：emit `building:started` → Sonnet 4.6 stream 生成 JSON（边流边发 `building:log`）→ `_extract_raw_json`（先 `<workflow_json>` 标签，再 balanced-brace scan）+ `_clean_raw_json`（去 markdown 围栏 + 去结尾逗号）→ JSON 不完整 fallback 到 `_build_fallback_workflow` 用 `_default_plan_nodes` 6 节点模板生成。`_build_context` 拼上下文给 LLM；`_tool_for_node` 按标题关键字猜 tool/tool_type |
| `backend/services/workflow_refinement.py` | Phase 4.5 前置：`subdivide_node(workflow, node_id, child_count=4)` 确定性把 phase 拆为 plan → 两条并行实现（同 `parallel_group`）→ verify 共 4 节点；child_count > 4 时追加 polish 节点。**不调 LLM**，等 Phase 6 升级为模型生成子图 |

#### 5.2.7 `backend/tests/`

| 文件 | 职责 |
|------|------|
| `backend/tests/__init__.py` | 空，标记 package |
| `backend/tests/test_clarifier_agent.py` | Clarifier：ask 分支 + present_plan 分支 + fallback 兜底（强制 LLM 报错）+ JSON 提取健壮性 |
| `backend/tests/test_conversation_manager.py` | ConversationState lifecycle + history append + clarification CRUD + set_plan 状态机迁移 |
| `backend/tests/test_executor_mock.py` | mock 路径：完整 `execution:node_started → node_log* → node_complete` 序列断言、按 `tool_type` 分支（web_automation → playwright execution_method）。用 spy 替换 `executor_mod.sio.emit` |
| `backend/tests/test_node_operations.py` | 节点编辑 PATCH + 单节点 run 后的 DB 持久化 + execution_control stop registry + DAG 字段 roundtrip + Subdivide 行为 + 父子关系归属（最大测试文件，10KB） |
| `backend/tests/test_orchestrator_agent.py` | route_message：关键字命中 → development_request；纯 `你好` → casual_chat；LLM 故障 fallback |
| `backend/tests/test_workflow_db.py` | save → load roundtrip + `_coerce_created_at` 类型修复 + `update_workflow_nodes` partial update |
| `backend/tests/test_workflow_designer.py` | JSON 提取（包括嵌入 `<workflow_json>` 标签）+ trailing comma 清理 + max_tokens stop_reason 时 fallback 走 `_build_fallback_workflow` |
| `backend/tests/test_workflows_router.py` | `GET /api/workflows` 空列表 + 多 workflow 按 `created_at` 倒序；monkeypatch 用内存 sqlite |

---

### 5.3 `frontend/`（Next.js 16 · App Router · Turbopack）

```
frontend/
├── app/                 # App Router 页面与 layout
├── components/          # React 组件（按业务模块组织）
├── hooks/               # 自定义 hook（目前仅 Socket.io 相关）
├── lib/                 # 工具函数 / API client / Socket.io 单例
├── stores/              # Zustand 全局 store
├── types/               # 共享 TypeScript 类型
├── public/              # 静态资源
├── node_modules/        # 依赖（gitignored）
├── .next/               # Next 构建产物（gitignored）
├── .dockerignore
├── .env.example / .env.local
├── .gitignore
├── AGENTS.md
├── components.json
├── Dockerfile
├── eslint.config.mjs
├── next-env.d.ts
├── next.config.ts
├── package.json
├── package-lock.json
├── postcss.config.mjs
├── README.md
├── tsconfig.json
└── tsconfig.tsbuildinfo
```

#### 5.3.1 frontend 根文件

| 文件 | 职责 |
|------|------|
| `frontend/.dockerignore` | 排除 `node_modules/` `.next/` `.env.local` `.git` |
| `frontend/.env.example` | 范例：`NEXT_PUBLIC_API_URL=http://localhost:8000/api` / `NEXT_PUBLIC_SOCKET_URL=http://localhost:8000` |
| `frontend/.env.local` | 本地真实配置（gitignored；docker 启动时由 `docker-compose.yml` 的 environment 段直接注入，本地裸跑才用这个文件） |
| `frontend/.gitignore` | next 默认 gitignore（`.next/` / `node_modules/` / `npm-debug.log*` / `.env*.local` 等） |
| `frontend/AGENTS.md` | 给 Cursor / Claude Code 看的 agent 守则：提醒 Next.js 16 有大量 breaking change，写代码前先读 `node_modules/next/dist/docs/`。**不写实质项目内容** |
| `frontend/components.json` | shadcn/ui 配置：`style: base-nova`、`tsx: true`、`baseColor: neutral`、icon 用 lucide、alias 走 `@/...` |
| `frontend/Dockerfile` | 单阶段 `node:22-alpine` + `npm install` + `CMD npm run dev`。开发友好（带 HMR），生产化等之后再做 multi-stage build |
| `frontend/eslint.config.mjs` | flat config：组合 `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`；覆盖 globalIgnores（`.next/`、`out/`、`build/`、`next-env.d.ts`） |
| `frontend/next-env.d.ts` | Next 自动生成的 TS 引用文件，**不要手动改** |
| `frontend/next.config.ts` | 极简：`const nextConfig: NextConfig = {}`。预留空间给将来 image domains / experimental flags |
| `frontend/package.json` | scripts: `dev` / `build` / `start` / `lint`；核心依赖：next 16.2.4、react 19.2.4、tailwindcss v4、@xyflow/react 12、framer-motion 12、zustand 5、socket.io-client 4.8、shadcn 4、@base-ui/react 1.4、@dnd-kit/core 6.3、react-markdown 10、vaul（drawer） |
| `frontend/package-lock.json` | npm lockfile（425KB），跟随 package.json 提交，保 CI 复现 |
| `frontend/postcss.config.mjs` | 只装 `@tailwindcss/postcss` 插件（Tailwind v4 用 PostCSS plugin 而非 CLI） |
| `frontend/README.md` | next 脚手架默认 README，**未被定制**——目前没承担文档职责，所有文档都在仓库根 README 和 `Documents/` 里 |
| `frontend/tsconfig.json` | TS 严格模式 + `paths: { "@/*": ["./*"] }` + 包含 `.next/types/**/*.ts`（Next typed routes 注入处） |
| `frontend/tsconfig.tsbuildinfo` | TS 增量构建缓存（221KB），影响 `tsc --noEmit` 速度。**gitignored** 应放进 `.gitignore` 但当前未忽略——TODO |

#### 5.3.2 `frontend/app/`（App Router）

```
app/
├── (app)/                    # 路由组：登录后的整个 app shell
│   ├── arena/page.tsx
│   ├── dashboard/page.tsx
│   ├── marketplace/page.tsx
│   ├── orchestra/page.tsx
│   ├── settings/page.tsx
│   ├── team/page.tsx
│   ├── workflows/page.tsx
│   ├── workflows/[id]/page.tsx
│   └── layout.tsx
├── favicon.ico
├── globals.css
├── layout.tsx
└── page.tsx
```

| 文件 | 职责 |
|------|------|
| `app/layout.tsx` | 根 layout：注入 Inter（500/600/700/900）、`<html lang="en">` `<body class="h-full bg-canvas text-ink">`；metadata title="OrchestrAI" |
| `app/page.tsx` | `redirect('/dashboard')`，让 `/` 不直接渲染空页 |
| `app/globals.css` | 设计 token v2：5 档 surface、双档暖棕 hairline、8 档 brand 色阶、4 档圆角、5 档字号、5 档 elevation、`--grain` noise、`bg-glass` / `bg-glass-surface`、`soft-pulse` 动画、`prefers-reduced-motion` 兜底。**唯一的全局 CSS** |
| `app/favicon.ico` | 站点 favicon |
| `app/(app)/layout.tsx` | 登录后 shell：左 `AppSidebar` + 右 `<TopBar /> + <main>`，`overflow-hidden` 锁三栏不滚 |
| `app/(app)/dashboard/page.tsx` | 落地页：HeroCard + 4 张 StatCard + 3 张 ProjectCard，纯展示，不连后端 |
| `app/(app)/orchestra/page.tsx` | The Orchestra 三栏：左 `RecentProjectsPanel` / 中 `ChatThread` / 右 `ContextPanel`。`useEffect` 初始化 sessionId（localStorage `orchestrai_session`，无则 `uuid.v4()`）→ `socket.emit('join_session')`；`useSocket(sessionId)` 绑全量事件 |
| `app/(app)/workflows/page.tsx` | 工作流列表：PageHeader + WorkflowGrid + LoadingSkeleton/EmptyState/ErrorState 四态切换。卡片跳 `/workflows/[id]`，右上 "New Workflow" 按钮跳 `/orchestra` |
| `app/(app)/workflows/[id]/page.tsx` | 工作流详情：从 `workflowStore.loadWorkflow(id)` 拿数据（已加载跳过 REST），三态 `LoadingState / NotFoundState / WorkflowCanvas`；挂 `useExecutionSocket(sessionId)` 订阅 execution:* live 事件 |
| `app/(app)/marketplace/page.tsx` | `<ComingSoon title="Marketplace" />` 占位，Phase 11 |
| `app/(app)/arena/page.tsx` | `<ComingSoon title="Arena" />` 占位，Phase 11 |
| `app/(app)/team/page.tsx` | `<ComingSoon title="Team" />` 占位，Phase 11 |
| `app/(app)/settings/page.tsx` | `<ComingSoon title="Settings" />` 占位，Phase 11 |

#### 5.3.3 `frontend/components/`

```
components/
├── dashboard/                # 落地页卡片
├── layout/                   # AppSidebar / TopBar / ComingSoon
├── orchestra/                # Orchestra 页三栏的全部组件
│   └── context/              # 右栏 9 个 drill-in 视图
├── ui/                       # shadcn/ui 基础组件
└── workflows/                # 画布相关
```

##### `components/dashboard/`

| 文件 | 职责 |
|------|------|
| `dashboard/HeroCard.tsx` | 落地页主卡：径向 ambient orbs、orbit rings 反向旋转、中心立方体 `sheen` 扫光、CTA 按钮 hover sheen |
| `dashboard/ProjectCard.tsx` | 项目卡片：`hover-lift`、在线徽章 `soft-pulse`、Play action 暖色渐变 |
| `dashboard/StatCard.tsx` | 指标卡片：图标 tile 渐变、hover tonal glow、支持 `delta` 字段、`tabular` 数字 |

##### `components/layout/`

| 文件 | 职责 |
|------|------|
| `layout/AppSidebar.tsx` | 玻璃态左栏：品牌 logo spring hover、nav `layoutId` 连续动画、Pro Plan 卡径向光晕。固定 9 个 nav 项，路由 active 由 `usePathname` 驱动 |
| `layout/ComingSoon.tsx` | 占位页通用组件：标题 + 暖色 hero + "敬请期待" 文案。给 marketplace/arena/team/settings 复用 |
| `layout/TopBar.tsx` | 玻璃态顶栏：搜索框、铃铛 notification（`soft-pulse`）、token 池 pill（双渐变）、头像（径向高光） |

##### `components/orchestra/`

| 文件 | 职责 |
|------|------|
| `orchestra/ChatThread.tsx` | 中栏对话：流式渲染（buffer + 静态 messages 双源）、EmptyState chips、avatar 渐变 + ring、发送按钮 `shadow-brand-glow`；`convState === 'generating'` 时禁用输入；接 `useSocket().sendMessage` |
| `orchestra/ContextPanel.tsx` | 右栏 shell：subscribe `orchestraStore.contextView`（discriminated union），用 `AnimatePresence mode="wait"` slide 方向由 `contextDirection` 控制；router 派发到 9 个子视图 |
| `orchestra/RecentProjectsPanel.tsx` | 左栏：项目列表 + 新建按钮 sheen + `layoutId` active 连续动画。当前是 mock 数据，等 Phase 11 接 marketplace 数据时换 |

##### `components/orchestra/context/`（drill-in 视图）

| 文件 | 职责 |
|------|------|
| `context/AgentReports.tsx` | Reports 视图：Artifact report 卡片（mock 内容） |
| `context/BuildingAgentDetail.tsx` | Building Process drill-in：终端 Activity Log + Pending Approvals 卡片（Phase 4.5 真接） |
| `context/BuildingProcessList.tsx` | Building Process 主列表：per-agent 进度条 + 状态 chip；当 `isBuildingComplete && readyWorkflowId` 时显示 "打开画布 · Open Canvas" CTA 跳 `/workflows/[id]` |
| `context/ClarificationDetail.tsx` | Clarification drill-in：per-agent 决策 radio 卡（mock 数据，Phase 10 接真 sub-agent） |
| `context/ClarificationsList.tsx` | Clarifications 主列表：agent 卡（有 clarification 时显示）+ "开始生成工作流" 卡（plan 出现后显示，`awaiting_confirm` 紫 badge / `generating|complete` 绿 badge） |
| `context/DetailHeader.tsx` | 所有 detail 视图复用的 back 按钮 + 标题；`aria-label="Back"` |
| `context/HistoryTimeline.tsx` | History 视图：时间线 + 每条 Undo/Redo（Phase 4.5 起接真 stack） |
| `context/OverviewList.tsx` | overview 视图：4 张 drill-in 卡（Clarifications / Building / Reports / History），badge 动态来自 store；卡片 stagger 进场 + hover glow |
| `context/PlanDetail.tsx` | plan-detail drill-in：plan 摘要卡（含锁标）+ 编辑 toggle（仅 `awaiting_confirm` 可见，编辑后 `updatePlanNode` 写回 store）+ 「开始生成工作流」按钮（emit `chat_confirm_start`）|

##### `components/ui/`（shadcn/ui base-nova）

| 文件 | 职责 |
|------|------|
| `ui/avatar.tsx` | 头像组件（图片 + fallback） |
| `ui/badge.tsx` | 状态标签（variant: default / outline / brand / success / warning） |
| `ui/button.tsx` | 按钮基类（variant + size） |
| `ui/drawer.tsx` | 抽屉（基于 vaul）。NodeDetailDrawer 内部用 |
| `ui/scroll-area.tsx` | Radix scroll area 包装 |
| `ui/select.tsx` | Radix select 包装 |
| `ui/separator.tsx` | 水平/竖直分隔线 |
| `ui/tooltip.tsx` | Radix tooltip 包装 |

##### `components/workflows/`

| 文件 | 职责 |
|------|------|
| `workflows/Breadcrumbs.tsx` | 面包屑组件：`href && !isLast` 时渲染 `<Link>`，其余渲染纯文本 |
| `workflows/NodeDetailDrawer.tsx` | **画布最大组件（35KB）**：大面板，双 tab（Configuration & Permissions / Sub-Agent Chat）。接口 `nodeId: string \| null`，内部 subscribe live node；支持节点编辑（title/description/model/tool/tool_type/schema/graph 字段）、Subdivide 按钮、Graph Structure 显示 depends_on / parallel_group，Sub-Agent Chat 是 Phase 10 占位 |
| `workflows/TaskNodeCard.tsx` | React Flow 自定义节点：accent 渐变条、phase/task 标识、parallel 标记、模型切换 dropdown、节点级 Run/Stop 按钮 |
| `workflows/WorkflowCanvas.tsx` | React Flow 画布主组件：DAG 边（`depends_on` 优先，旧数据 fallback 串联）、分层布局（`computeNodeLevels` BFS）、顶栏 Run 按钮（mock 默认开）、`selectedNodeId` 驱动 drawer、`workflowSig` 字符串签名驱动 nodes/edges 重建 |

#### 5.3.4 `frontend/hooks/`

| 文件 | 职责 |
|------|------|
| `hooks/useExecutionSocket.ts` | detail 页 scoped hook：复用 `lib/socket.ts` singleton；只绑 `execution:*` 五个事件（`node_started/log/complete/error/workflow_complete`）+ 新加的 `node_stopping/node_stopped`；自动 `join_session` 进同一 room |
| `hooks/useSocket.ts` | Orchestra 页全量 Socket.io binding：绑所有 chat / clarification / building / workflow / history / execution 事件；导出 `sendMessage(content)` 和 `confirmStart(sid)`；`execution:node_complete` 用 `toExecutionMethod()` 收窄入参 |

#### 5.3.5 `frontend/lib/`

| 文件 | 职责 |
|------|------|
| `lib/api.ts` | REST client：`fetchWorkflow(id)` / `listWorkflows()` / `runWorkflow(id, sid, opts)`（mock 默认 true）/ `runNode(id, sid, opts)` / `stopNode(id, sid)` / `retryNode(id, sid)` / `updateNodeModel(...)` / `updateWorkflowNode(workflowId, nodeId, patch)` / `subdivideWorkflowNode(...)`；BASE 取 `NEXT_PUBLIC_API_URL` |
| `lib/socket.ts` | `getSocket()` 单例：`io(NEXT_PUBLIC_SOCKET_URL, { transports: ['websocket','polling'], autoConnect: false })`。多个 hook 共享，避免重复连接 |
| `lib/utils.ts` | `cn(...classes)` = `twMerge(clsx(...))`，shadcn 标配 |

#### 5.3.6 `frontend/stores/`

| 文件 | 职责 |
|------|------|
| `stores/orchestraStore.ts` | Orchestra 页唯一事实来源。State：`sessionId` / `convState`（5 态状态机）/ `contextView`（discriminated union 含 `plan-detail`）/ `contextDirection` / `messages[]` / `streamingBuffers` / `clarificationQuestions[]` / `plan` / `buildingLogs[]` / `isBuildingComplete` / `historyEntries[]` / `readyWorkflowId`。Actions：消息流（addMessage / appendStreamToken / finalizeStream）+ clarification 编辑（updateClarificationDraft / confirmClarifications）+ `updatePlanNode(order, patch)` + history + reset |
| `stores/workflowStore.ts` | Workflows 画布唯一事实来源。State：`workflow` / `workflowId` / `viewMode` / `isExecuting` / `newNodeIds[]` / `nodeLogs{}` / `isLoading`。Actions：`loadWorkflow(id)`（已加载跳过 REST + 重置 transient）/ `updateNode(nodeId, patch)` / `addNodes(nodes[])`（去重）/ `updateNodeStatus/Result/Error` / `appendNodeLog` / `swapNodeModel` / `markNodeOld`。用 `(set, get)` pattern 避免 `useWorkflowStore.getState()` TS 推导黑洞 |

#### 5.3.7 `frontend/types/`

| 文件 | 职责 |
|------|------|
| `types/chat.ts` | `MessageType` 字符串联合、`AISender`、`ChatMessage` |
| `types/workflow.ts` | `NodeStatus` / `ExecutionMethod` / `ToolType` / `NodeType` 字符串联合；`toExecutionMethod(value)` 类型卫士；`NodeResult` / `WorkflowNode`（含 DAG 字段）/ `Workflow` / `WorkflowSummary`（列表页轻量投影） |

#### 5.3.8 `frontend/public/`

| 文件 | 职责 |
|------|------|
| `public/file.svg` / `public/globe.svg` / `public/next.svg` / `public/vercel.svg` / `public/window.svg` | next 脚手架默认资源。**目前未在代码里被引用**，可在 Phase 11 清理 |

---

### 5.4 Legacy / 清理备忘

| 路径 | 状态 | 处理 |
|------|------|------|
| `frontend/components/workflow/`（单数） | 已物理删除（Phase 2.6） | 不要重新引入；统一用 `components/workflows/`（复数） |
| `frontend/components/chat/` | 已物理删除（Phase 2.6） | 不要重新引入；用 `components/orchestra/ChatThread.tsx` |
| `frontend/stores/chatStore.ts` | 已物理删除（Phase 2.6） | 用 `stores/orchestraStore.ts` |
| `backend/services/multi_ai.py` / `backend/services/orchestrator.py` | git 显示 D（已删除） | 已被 `orchestrator_agent.py` / `clarifier_agent.py` / `workflow_designer.py` 三件套替代 |
| `frontend/README.md` | 未定制（next 脚手架原文） | 当前没承担文档职责；如重命名 / 删除，记得同步 `frontend/.gitignore` 等 |
| `frontend/public/*.svg` | next 脚手架默认资源，未被代码引用 | Phase 11 清理可一起删 |
| `frontend/tsconfig.tsbuildinfo` | 当前未加入 `.gitignore` | TODO：补 ignore |

---

## 6. Harness Engineering 六维度（全局铁律）

**项目开发过程**和**用户用本项目构建工作流的过程**，都必须满足以下六大维度。任何 Phase 开工前要先写一段"本 Phase 对六维度的贡献"。

### ① 上下文工程 Context Engineering

- **分层指令文件**：`Documents/*.md` + `backend/prompts/*.md` + 未来每个 sub-agent 的 `CLAUDE.md`（Phase 4.5 引入）共同构成知识基座
- **子 Agent 防火墙**：高噪声任务（长网页解析、多轮 debug、大日志筛查）用 sub-agent 隔离，返回 summary，不污染主对话
- **窗口管理**：context 接近满时自动 **compact**（保留：当前目标 / 最近 N 条 observation / 关键 decision；丢掉：过时 log / 已结算 observation）
- **动态注入**：不把事实塞死进 prompt，从系统日志 / DB / 工具调用结果动态取

### ② 工具编排 Tool Orchestration

- **精心挑选而非盲目堆砌**：每个 agent 只看到它需要的工具（Executor agent 看不到 CUA 工具，Perception agent 看不到 DB 写操作）
- **统一协议**：内部用自研 `ToolCall` 接口；Phase 5 起，对**外部 agent**（Claude Desktop / Claude Code / 其他 MCP 客户端）可按需包 MCP wrapper
- **沙箱隔离**：所有工具调用走 Docker / VM，**永不碰宿主机生产环境**
- **分级工具**：`read-only`（搜索、读文件）/ `mutating`（写文件、网络请求）/ `dangerous`（删除、安装、卸载、扣费）三级，每级不同审批策略

### ③ 验证机制 Verification

- **确定性约束**：每次 agent 输出代码后，自动跑 Linter（ruff / eslint）+ type checker（mypy / tsc）+ 单测
- **生成 / 评估分离**：生成节点用 Sonnet，评估节点用 Opus 或 GPT 独立实例，**避免自我背书**
- **多 agent 审查循环**：关键节点产出 → evaluator → 不通过则 re-plan，最多 3 轮
- **快照对比**：UI / 屏幕相关任务产出截图与 golden reference diff（CUA 场景关键）

### ④ 状态管理 State Management

- **进度清单**：每个工作流持久化 `TaskList`（已完成 / 进行中 / 待办），UI 上断点可见
- **Git 快照 / DB checkpoint**：每完成一个重要节点打快照，失败时能 resume 而不是从头重来
- **Trajectory 存储**：所有 `(observation, thought, action)` 三元组持久化，为 replay 和 failure debugging 服务
- **Idempotency**：工具调用要设计成 idempotent，同一调用重放不会双倍副作用

### ⑤ 可观测性 Observability

- **全程 tracing**：每个工具调用 / 每个 LLM 调用都有 OpenTelemetry span，后台可看完整调用链
- **结构化日志**：所有日志带 `session_id / node_id / agent / event_type`，可按维度过滤
- **质量分级**：节点产出打分（`success` / `partial` / `fail`），聚合到 dashboard
- **失败归因**：不止说"失败"，归因到 `prompt_issue` / `model_capability` / `tool_bug` / `external_service_degraded` 四类

### ⑥ 人类接管 Human-in-the-Loop

- **硬边界（必须触发 approval gate）**：删除数据库、系统扣费、发客户邮件、安装 / 卸载软件、执行不可逆的系统级操作
- **Approval Window UI**：前端 Building Process 面板弹出审批卡片（复用 Phase 2.5 的 `approvals` 位置）
- **Kill Switch**：任何执行中的 agent 用户一键可终止，终止后状态保留（Checkpoint 可 resume），**不是 crash**
- **Capability Scoping**：工作流声明它需要的 capability（文件系统路径 / 网络域名白名单 / 安装权限），用户首次执行时一次性授权

> **这六点不是 Phase 4.5 一次做完就结束——是所有后续 Phase 的设计约束。Phase 5/6/7/8 都要在开工前回答"我这个 Phase 对六维度各贡献什么"。**

---

## 7. 开发与验证

### 7.1 启动 / 停止

```bash
# 整套启动（推荐）
docker compose up -d --build

# 停止保留数据
docker compose down
# 停止并清空 DB（销毁 pgdata 卷）
docker compose down -v

# 日志
docker compose logs -f               # 全部
docker compose logs -f backend       # 仅后端
```

### 7.2 本地无 Docker（HMR 开发）

```bash
# 只起数据库
docker compose up -d db

# Terminal 1 — Backend
cd backend
python -m venv venv && .\venv\Scripts\activate   # PowerShell（Windows）
# source venv/bin/activate                       # macOS / Linux
pip install -r requirements.txt
uvicorn main:socket_app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
```

### 7.3 验证基线（每次开工 / PR 前都要跑）

```bash
# 前端类型 + lint + build
cd frontend
npx tsc --noEmit
npx eslint . --quiet
npm run build      # CI 跑这一个

# 后端测试
cd backend
.\venv\Scripts\python.exe -m pytest tests -q   # Windows
# python -m pytest tests -q                    # 其它
```

CI（`.github/workflows/ci.yml`）会复刻这三条，PR 必须全绿。

### 7.4 健康日志样本

健康的 `docker compose logs -f backend` 应看到：

```
[orchestrator] route: development_request
[clarifier] action: ask / present_plan
[designer] workflow saved: wf_xxxxxxxx
```

### 7.5 沙箱 / 环境约束

| 事项 | 约束 |
|------|------|
| `rm` 删除文件 | Cowork 沙箱不允许，需 `mcp__cowork__allow_cowork_file_delete` 交互审批 |
| `WebFetch` Figma | `www.figma.com` 在 egress 黑名单，不要绕过 |
| `Write` 工具 | 必须先 `Read` 目标文件才能 `Write` 覆盖 |
| **CUA 开发（Phase 7+）** | **只在本地 Windows 或 VM 里跑**，绝不在 CI / 生产服务器做桌面自动化测试 |

---

## 8. 给团队新成员的一句话建议

> **先读 §0 + §5 文件结构 + §6 Harness 六维度，再按 §7 跑一遍验证基线，最后挑一个开放 Phase（§1.2 标 🔲 的）看 `phase-history-and-handoff.md` 里对应的任务清单。任何 Phase 开工前写一段"本 Phase 对六维度各贡献什么"再动手，这是项目的宪法级约束。**
