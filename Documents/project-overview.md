# OrchestrAI — 项目总览

> **用途**：任何接手本项目的 agent 第一个要读的文件。包含速览、Phase 路线图、技术栈、核心架构决策、Harness 六维度铁律、文件索引。历史细节请查 `phase-history-and-handoff.md`。
>
> **最新状态锚点（2026-04-24）**：Phase 4 **Step 1-5 已归档完成**（stub 清理 + 历史 lint 修复 + `/workflows` 列表/详情路由 + Orchestra→Canvas CTA + NodeDetailDrawer 接真数据）。Step 6（节点实时状态 + mock 执行事件）已决定并入 Phase 4.5 D5 一起做，不再单独开工。**下一步 = Phase 4.5（Harness Foundation）**——结构化日志 / 执行追踪 / checkpoint & resume / HITL approval / context compaction。

---

## 0. 速览（30 秒理解项目）

**OrchestrAI** = 一个**面向真实桌面任务**的 AI 工作流编排平台。用户用自然语言描述目标 → Orchestrator(Haiku) 识别意图 → Clarifier(Sonnet) 多轮澄清 → 用户 confirm → WorkflowDesigner 生成可视化工作流（React Flow 画布）→ 每个节点可配 Claude / GPT / Gemini / DeepSeek 等不同模型 → 节点执行时可以调用浏览器自动化、本地桌面操作、文件系统、进程控制等工具。

**目标能力范围**：从"帮我做一份 PPT"这种纯 AI 任务，到"每天定时自动清原神日常"或"让 AI 打开浏览器用 Tripo 网站帮我把图片转成 3D 模型"这种**需要操控真实 Windows 桌面**的任务。

**暖色设计系统**（牛奶咖色 canvas + 琥珀橘 brand），"编排交响乐团"的视觉隐喻。

**当前可用路径**：`/dashboard`、`/orchestra`（三栏编排，核心）、`/workflows`（画布）、`/marketplace` `/arena` `/team` `/settings`（占位）。

---

## 1. Phase 路线图

### 1.1 设计哲学：5 层 Tier

| Tier | 名称 | 定位 |
|------|------|------|
| A | UI 闭环 | 让原 Phase 3 产出的工作流能从对话端走到画布端，跑通最短路径 |
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
| 3 | 前置 | The Orchestra 功能接线 | ✅ | Chat→Clarify→Confirm→生成工作流，3 Agent 架构，端到端打通 |
| 2.6 | 前置 | 前端清理 + 视觉质感升级 | ✅ | 设计 token v2，12 核心组件升级（2026-04-21） |
| **4** | **A** | **Workflows 画布功能接线** | 🟡 Step 1-5 ✅ | Stub 清理 ✅、`/workflows` 列表 + `[id]` 详情 ✅、Orchestra → Canvas CTA ✅、NodeDetailDrawer 真数据 ✅；**Step 6 节点实时状态并入 Phase 4.5 D5** |
| **4.5** | **B** | **Agent Harness Foundation** | 🔲 **next** | 结构化日志 + 执行追踪 + checkpoint & resume + HITL approval 框架 + context compaction 基础设施 |
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
| 前端框架 | Next.js 15（Turbopack, App Router） |
| UI | Tailwind v4 + shadcn/ui |
| 状态管理 | Zustand（`orchestraStore` / `workflowStore`） |
| 动画 | Framer Motion |
| 节点图 | @xyflow/react（React Flow） |
| 实时通信 | Socket.io（python-socketio ASGI） |
| 图标 | lucide-react |
| 字体 | Inter（next/font） |
| 后端框架 | Python FastAPI |
| 数据库 | PostgreSQL 16 + SQLAlchemy async + asyncpg |
| AI（结构化 reasoning） | Anthropic Claude（Haiku 4.5 / Sonnet 4.6 / Opus） |
| 容器化 | Docker Compose（db + backend + frontend） |

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

---

## 4. 核心架构决策

### 4.1 三 Agent 模型（现）

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
  history:update

Server → Client（Phase 4.5 新增）
  execution:approval_required  { approval_id, action, risk_level, context }
  execution:trace              { span_id, agent, input_summary, output_summary, duration_ms }
  execution:checkpoint         { session_id, step, resumable_at }
```

### 4.5 Harness Engineering 六维度（全局铁律）

**项目开发过程**和**用户用本项目构建工作流的过程**，都必须满足以下六大维度。任何 Phase 开工前要先写一段"本 Phase 对六维度的贡献"。

#### ① 上下文工程 Context Engineering

- **分层指令文件**：`Documents/*.md` + `backend/prompts/*.md` + 未来每个 sub-agent 的 `CLAUDE.md`（Phase 4.5 引入）共同构成知识基座
- **子 Agent 防火墙**：高噪声任务（长网页解析、多轮 debug、大日志筛查）用 sub-agent 隔离，返回 summary，不污染主对话
- **窗口管理**：context 接近满时自动 **compact**（保留：当前目标 / 最近 N 条 observation / 关键 decision；丢掉：过时 log / 已结算 observation）
- **动态注入**：不把事实塞死进 prompt，从系统日志 / DB / 工具调用结果动态取

#### ② 工具编排 Tool Orchestration

- **精心挑选而非盲目堆砌**：每个 agent 只看到它需要的工具（Executor agent 看不到 CUA 工具，Perception agent 看不到 DB 写操作）
- **统一协议**：内部用自研 `ToolCall` 接口；Phase 5 起，对**外部 agent**（Claude Desktop / Claude Code / 其他 MCP 客户端）可按需包 MCP wrapper
- **沙箱隔离**：所有工具调用走 Docker / VM，**永不碰宿主机生产环境**
- **分级工具**：`read-only`（搜索、读文件）/ `mutating`（写文件、网络请求）/ `dangerous`（删除、安装、卸载、扣费）三级，每级不同审批策略

#### ③ 验证机制 Verification

- **确定性约束**：每次 agent 输出代码后，自动跑 Linter（ruff / eslint）+ type checker（mypy / tsc）+ 单测
- **生成 / 评估分离**：生成节点用 Sonnet，评估节点用 Opus 或 GPT 独立实例，**避免自我背书**
- **多 agent 审查循环**：关键节点产出 → evaluator → 不通过则 re-plan，最多 3 轮
- **快照对比**：UI / 屏幕相关任务产出截图与 golden reference diff（CUA 场景关键）

#### ④ 状态管理 State Management

- **进度清单**：每个工作流持久化 `TaskList`（已完成 / 进行中 / 待办），UI 上断点可见
- **Git 快照 / DB checkpoint**：每完成一个重要节点打快照，失败时能 resume 而不是从头重来
- **Trajectory 存储**：所有 `(observation, thought, action)` 三元组持久化，为 replay 和 failure debugging 服务
- **Idempotency**：工具调用要设计成 idempotent，同一调用重放不会双倍副作用

#### ⑤ 可观测性 Observability

- **全程 tracing**：每个工具调用 / 每个 LLM 调用都有 OpenTelemetry span，后台可看完整调用链
- **结构化日志**：所有日志带 `session_id / node_id / agent / event_type`，可按维度过滤
- **质量分级**：节点产出打分（`success` / `partial` / `fail`），聚合到 dashboard
- **失败归因**：不止说"失败"，归因到 `prompt_issue` / `model_capability` / `tool_bug` / `external_service_degraded` 四类

#### ⑥ 人类接管 Human-in-the-Loop

- **硬边界（必须触发 approval gate）**：删除数据库、系统扣费、发客户邮件、安装 / 卸载软件、执行不可逆的系统级操作
- **Approval Window UI**：前端 Building Process 面板弹出审批卡片（复用 Phase 2.5 的 `approvals` 位置）
- **Kill Switch**：任何执行中的 agent 用户一键可终止，终止后状态保留（Checkpoint 可 resume），**不是 crash**
- **Capability Scoping**：工作流声明它需要的 capability（文件系统路径 / 网络域名白名单 / 安装权限），用户首次执行时一次性授权

> **这六点不是 Phase 4.5 一次做完就结束——是所有后续 Phase 的设计约束。Phase 5/6/7/8 都要在开工前回答"我这个 Phase 对六维度各贡献什么"。**

### 4.6 其它关键决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 工具层是否做成 MCP | **内部 service 为主**，必要时包 MCP wrapper | 项目内部 node executor 直接调 service 最简单；MCP 价值在"给外部 agent 用"，不是我们首要目标 |
| 多模态兜底模型 | **Gemini 2.x** | 原生支持视频 / 音频 / 长上下文（数小时视频），覆盖面最大；豆包作中文特别重的场景可选 |
| 3D 文件理解 | **多视角渲染 → 图片 → VLM** | 主流 LLM 都不吃 `.obj/.gltf/.fbx`；Tripo/Meshy/Rodin 是生成型不是理解型；PointLLM/3D-LLM 是学术工具不成熟 |
| Sandbox 粒度 | 节点级 Docker（Phase 6），CUA 用独立 Windows VM / 独立进程（Phase 7） | 平衡隔离性与启动开销 |
| Checkpoint 存储 | PostgreSQL `agent_sessions` 表 | 复用已有 DB，无需引入 Redis |
| 工作流确认流程 | **永远先澄清再确认**，不自动生成 | 用户掌控感，避免错误工作流 |
| DB 持久化（Phase 4.5 后） | Workflow + ChatMessage + **AgentSession** + **ExecutionTrace** + **ApprovalRecord** | 支持 checkpoint / resume / replay / audit |

### 4.7 设计系统铁律（Phase 2.6 起）

- **绝不回到 v1 的单色 hairline**，统一用 `border-hairline` / `border-hairline-strong`
- **不再用 Tailwind 原生 `shadow-sm/md/lg`**，全部用 `shadow-card/card-md/elevated/floating/overlay`
- **圆角只用 4 档**：`rounded-[8px|12px|16px|20px]` 或 `rounded-sm/md/lg/xl`
- **动画优先 `soft-pulse`，不用 `ping`**（后者视觉过锐）
- **玻璃面板**：`bg-glass` 用大面积（sidebar 等），`bg-glass-surface` 用浮层（drawer 等）

---

## 5. 文件索引

### 5.1 规划文档（`Documents/`）

| 文件 | 何时读 |
|------|--------|
| **`project-overview.md`（本文件）** | **每次开工第一件事**——速览 + Phase 路线图 + Harness 六维度铁律 + 文件索引 |
| **`phase-history-and-handoff.md`** | 接着读——Phase 归档 + 下一个 Agent 的任务清单（按 Tier A→E 分层） |

### 5.2 前端热文件（路径相对 `frontend/`）

| 文件 | 职责 |
|------|------|
| `app/(app)/layout.tsx` | AppSidebar + TopBar 壳 |
| `app/(app)/orchestra/page.tsx` | 三栏布局（左 Recent / 中 Chat / 右 Context） |
| `app/(app)/workflows/page.tsx` | Workflows 列表页（Phase 4）：PageHeader + 网格卡片 + Loading/Empty/Error 态 |
| `app/(app)/workflows/[id]/page.tsx` | Workflows 详情页（Phase 4）：Loading/NotFound/WorkflowCanvas 三态，store 已加载则跳过 REST |
| `app/globals.css` | 设计 token v2 |
| `lib/api.ts` | REST client：`fetchWorkflow` / `listWorkflows` / `runWorkflow` / `updateNodeModel` |
| `components/orchestra/ChatThread.tsx` | 流式渲染消息、EmptyState chips、发送按钮 |
| `components/orchestra/ContextPanel.tsx` | 右栏 View union 导航壳（直接 subscribe `orchestraStore.contextView`） |
| `components/orchestra/context/*.tsx` | 8 个 drill-in 视图组件；`BuildingProcessList` 含 "打开画布" CTA |
| `components/workflows/WorkflowCanvas.tsx` | React Flow 画布，`selectedNodeId` 驱动 drawer |
| `components/workflows/TaskNodeCard.tsx` | 自定义节点 |
| `components/workflows/NodeDetailDrawer.tsx` | 侧抽屉，接 `nodeId` + workflowStore selector，Details / Result 两 tab |
| `components/workflows/Breadcrumbs.tsx` | 面包屑，`href && !last` 时渲染 `<Link>` |
| `stores/orchestraStore.ts` | Orchestra 唯一事实来源（含 `ContextView` discriminated union、`readyWorkflowId`） |
| `stores/workflowStore.ts` | Workflows 画布唯一事实来源，含 `loadWorkflow(id)` REST 去水化 |
| `hooks/useSocket.ts` | Socket.io 事件绑定；`execution:node_complete` 用 `toExecutionMethod()` 收窄 |
| `types/workflow.ts` | `Workflow` / `WorkflowNode` / `WorkflowSummary` / `NodeStatus` / `ExecutionMethod` + `toExecutionMethod()` 类型卫士 |

### 5.3 后端热文件（路径相对 `backend/`）

#### 已有（Phase 1-3）

| 文件 | 职责 |
|------|------|
| `main.py` | FastAPI + Socket.io ASGI 入口 |
| `services/conversation_manager.py` | `ConversationState` dataclass + per-session CRUD |
| `services/orchestrator_agent.py` | Intent 路由（Haiku 4.5） |
| `services/clarifier_agent.py` | 多轮澄清 + plan 生成（Sonnet 4.6） |
| `services/workflow_designer.py` | 工作流 JSON 生成（Sonnet 4.6） |
| `services/workflow_db.py` | `WorkflowRecord` CRUD |
| `models/chat.py` | Pydantic 模型 |
| `models/db.py` | SQLAlchemy ORM |
| `routers/workflow.py` | `GET /api/workflow/{id}`、`PATCH /api/workflow/{id}/node/{node_id}` |
| `routers/workflows.py` | `GET /api/workflows` → `List[WorkflowSummary]`（Phase 4 新增，按 `created_at` 倒序） |
| `tests/test_workflows_router.py` | 2 个 async test：空列表 + 多 workflow 倒序（Phase 4 新增） |

#### 即将新增（Phase 4.5+）

| 文件 / 目录 | 职责 | 引入 Phase |
|-------------|------|-----------|
| `services/observability/` | 结构化 logger + tracer 封装 | 4.5 |
| `services/checkpoint/` | Session state 持久化 + resume | 4.5 |
| `services/approval/` | HITL approval gate 核心 | 4.5 |
| `services/tools/web_search.py` | Tavily / Brave / Exa 统一 search wrapper | 5 |
| `services/tools/web_fetch.py` | httpx + Playwright 两档 fetch | 5 |
| `services/tools/multimodal_preprocess.py` | 视频 / 音频 / 3D / Office → Claude-compatible | 5 |
| `services/tools/registry.py` | Tool registry + 多模型 schema 转换 | 6 |
| `services/executor/sandbox.py` | Docker 节点沙箱 | 6 |
| `services/executor/evaluator.py` | 独立评估 agent | 6 |
| `services/cua/perception.py` | 截图 + UIA + OCR 封装 | 7 |
| `services/cua/action.py` | pywinauto / pyautogui 统一接口 | 7 |
| `services/cua/planner.py` | Planner-Executor loop | 7 |
| `services/cua/safety.py` | Capability scoping + audit log | 7 |
| `services/cua/lifecycle.py` | 软件安装 / 卸载 / 进程管理 | 8 |

### 5.4 Legacy 清理备忘

`components/workflow/`、`components/chat/`、`stores/chatStore.ts` 三组 stub 文件在 Phase 2.6 之后已被物理删除，Phase 4 Step 1 验证后更新 README 措辞；前端现仅保留 `components/workflows/`（复数）+ `components/orchestra/ChatThread.tsx` 一套实现。

---

## 6. 沙箱 / 环境约束

| 事项 | 约束 |
|------|------|
| `rm` 删除文件 | Cowork 沙箱不允许，需 `mcp__cowork__allow_cowork_file_delete` 交互审批 |
| `WebFetch` Figma | `www.figma.com` 在 egress 黑名单，不要绕过 |
| `Write` 工具 | 必须先 `Read` 目标文件才能 `Write` 覆盖 |
| 前端 lint / type check | `cd frontend && npx tsc --noEmit` / `npx eslint . --quiet` |
| 后端测试 | `cd backend && pytest` |
| **CUA 开发（Phase 7+）** | **只在本地 Windows 或 VM 里跑**，绝不在 CI / 生产服务器做桌面自动化测试 |

---

## 7. 验证命令速查

```bash
# 启动整套
docker compose up --build
# 访问 http://localhost:3000/orchestra

# 前端类型 + lint
cd frontend && npx tsc --noEmit && npx eslint . --quiet

# 后端测试
cd backend && pytest

# 日志观察
docker compose logs -f backend
# 健康的日志应出现：
#   [orchestrator] route: development_request
#   [clarifier] action: ask / present_plan
#   [designer] workflow saved: wf_xxxxxxxx
```

---

## 8. 给继任 Agent 的一句话建议

> **先读本文件（Harness 六维度章节必读），再读 `phase-history-and-handoff.md` 的「下一个 Agent 任务」段，按 Tier 顺序推进。任何 Phase 开工前先写一段"本 Phase 对六维度各贡献什么"再动手，这是项目的宪法级约束。**
