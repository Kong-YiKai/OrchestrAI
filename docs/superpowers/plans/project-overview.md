# OrchestrAI — 项目总览

> **用途**：任何接手本项目的 agent 第一个要读的文件。包含速览、Phase 路线图、技术栈、架构决策、文件索引。历史细节请查 `phase-history-and-handoff.md`。
>
> **最新状态锚点（2026-04-21）**：Phase 3（Orchestra 接线）+ Phase 2.6（前端结构清理 + 视觉质感升级）均已完成。下一步 = Phase 4（Workflows 画布功能接线）。

---

## 0. 速览（30 秒理解项目）

**OrchestrAI** = AI 工作流编排平台 Demo。用户用自然语言描述目标 → Orchestrator(Haiku) 识别意图 → Clarifier(Sonnet) 多轮澄清并呈现 plan → 用户 confirm → WorkflowDesigner(Sonnet) 生成可视化工作流（React Flow 画布）→ 每个节点可换不同 AI 模型 → Phase 6 执行引擎负责跑。

**暖色设计系统**（牛奶咖色 canvas + 琥珀橘 brand），"编排交响乐团"的视觉隐喻。

**当前可用路径**：`/dashboard`（落地页）、`/orchestra`（三栏编排，核心）、`/workflows`（画布）、`/marketplace` `/arena` `/team` `/settings`（占位）。

---

## 1. Phase 状态总览

| Phase | 名称 | 状态 | 核心交付 |
|-------|------|------|---------|
| 1 | 核心脚手架 + 分屏布局 | ✅ | Next.js + FastAPI + Socket.io + Zustand + React Flow |
| 1.5 | Docker Compose + DB 基础设施 | ✅ | PostgreSQL 16 + async SQLAlchemy + Docker 一键启动 |
| 2 | 设计系统 v1 + App Shell | ✅ | 暖色主题 + AppSidebar/TopBar + 3 路由骨架 |
| 2.5 | Orchestra 右栏 Context Panel 重构 | ✅ | 4 竖排 drill-in 卡片 + View union 导航 + 两级下钻（2026-04-17） |
| 3 | The Orchestra 功能接线 | ✅ | Chat→Clarify→Confirm→生成工作流，3 Agent 架构，端到端打通 |
| 2.6 | 前端结构清理 + 视觉质感升级 | ✅ | stub 清除 legacy `workflow/`+`chat/`+`chatStore`，设计 token v2，12 核心组件升级（2026-04-21） |
| **4** | **Workflows 画布功能接线** | 🔲 | 节点持久化、NodeDetailDrawer 真实数据、Breadcrumbs 可点、新建 `/workflows` 列表页 |
| 5 | 嵌套 Sub-chat 分叉 + File Repository | 🔲 | 节点内 Sub-chat、Building Log 点击展开 |
| 6 | 节点执行引擎 | 🔲 | API 直连 → Playwright → Claude 模拟三层降级，Approval Window |
| 7 | 多 AI 扇出 + 双语 + 占位页 + 打磨 | 🔲 | GPT/Gemini 扇出、中英双语、Marketplace/Arena 真实化 |

**Phase 间依赖关系**：

```
Phase 3 (Orchestra 接线) ── 产出真实工作流数据结构
  ↓
Phase 4 (Workflows 画布)  ── 依赖 Phase 3 的工作流数据
  ↓
Phase 5 (Sub-chat)        ── 依赖 Phase 3 的对话架构
  ↓
Phase 6 (执行引擎)        ── 依赖 Phase 4 的节点展示
  ↓
Phase 7 (打磨)            ── 依赖所有前序 Phase
```

---

## 2. 技术栈

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
| AI | Anthropic Claude（Haiku 4.5 / Sonnet 4.6）, OpenAI GPT, Google Gemini |
| 浏览器自动化 | Playwright（Phase 6） |
| 容器化 | Docker Compose（db + backend + frontend） |

---

## 3. 路由结构

```
/ → redirect → /dashboard

/dashboard          落地页，项目概览
/orchestra          The Orchestra：三栏 AI 编排（核心功能）
/workflows          Workflows 画布（React Flow）
/marketplace        占位（Phase 7）
/arena              占位（Phase 7）
/team               占位（Phase 7）
/settings           占位（Phase 7）
```

---

## 4. 核心架构决策

### 4.1 三 Agent 模型

| Agent | 模型 | 触发时机 | 职责 |
|-------|------|---------|------|
| Orchestrator | Haiku 4.5 | 每次 `chat_send` 的第一个调用 | intent 二分：`casual_chat` / `development_request` |
| Clarifier | Sonnet 4.6 | 识别为 `development_request` 后 | 多轮提问 → 聚合 → 生成 plan（`clarification:plan_ready`） |
| Workflow Designer | Sonnet 4.6 | 用户 `chat_confirm_start` 后 | 生成工作流 JSON，流式下发 `building:log`，最后 `workflow:ready` |

### 4.2 ConversationState 状态机（后端内存，per session_id）

```
idle → clarifying → awaiting_confirm → generating → complete
           ↑                ↓
           └─ re-ask ←──────┘   （用户在确认阶段追加需求时回退）
```

**重要**：`ConversationState` **不**持久化到 DB（是后端进程内存 dict）。只有 `WorkflowRecord` 和 `ChatMessageRecord` 进 PostgreSQL。Demo 重启无历史是设计上的妥协。

### 4.3 Socket.io 事件契约

```
Client → Server
  chat_send              { session_id, content }
  chat_confirm_start     { session_id }
  join_session           { session_id }

Server → Client
  chat:stream_start      { message_id, sender }
  chat:stream_token      { message_id, token }
  chat:stream_end        { message_id, content }
  chat:message           ChatMessage              # non-streaming 完整消息
  clarification:update   { questions: [...] }     # Clarifier 提出问题
  clarification:plan_ready { plan }               # Clarifier 呈现计划，等待用户 confirm
  building:started       { session_id }
  building:log           BuildingLog              # 每条日志
  building:complete      { node_count }
  workflow:ready         { workflow_id, title, node_count }  # 触发前端跳 /workflows
  history:update         { entries: HistoryEntry[] }
```

### 4.4 其它关键决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 会话状态机 | 后端内存 dict，per session_id | 简单可靠，Phase 3 足够用 |
| 工作流确认流程 | 永远先澄清再确认，不自动生成 | 用户掌控感，避免错误工作流 |
| Approval Window | Phase 6 实现（执行引擎阶段） | 只在节点真正执行危险操作时才需要 |
| Sub-chat | Phase 5 实现 | 避免 Phase 3 复杂度过高 |
| DB 持久化 | 仅 Workflow + ChatMessage | ConversationState 内存即可，重启无历史符合 Demo 定位 |

### 4.5 设计系统铁律（Phase 2.6 起）

- **绝不回到 v1 的单色 hairline**，统一用 `border-hairline` / `border-hairline-strong`
- **不再用 Tailwind 原生 `shadow-sm/md/lg`**，全部用 `shadow-card/card-md/elevated/floating/overlay`
- **圆角只用 4 档**：`rounded-[8px|12px|16px|20px]` 或 `rounded-sm/md/lg/xl`
- **动画优先 `soft-pulse`，不用 `ping`**（后者视觉过锐）
- **玻璃面板**：`bg-glass` 用大面积（sidebar 等），`bg-glass-surface` 用浮层（drawer 等）

---

## 5. 文件索引（供快速定位）

### 5.1 规划文档（本目录 `docs/superpowers/plans/`）

| 文件 | 何时读 |
|------|--------|
| **`project-overview.md`（本文件）** | **每次开工第一件事** — 确认当前 Phase 状态和架构决策 |
| **`phase-history-and-handoff.md`** | 读完本文件后接着读 — 已完成 Phase 的归档 + 下一个 Agent 的任务清单 |

### 5.2 前端热文件（路径相对 `frontend/`）

| 文件 | 职责 |
|------|------|
| `app/(app)/layout.tsx` | AppSidebar + TopBar 壳 |
| `app/(app)/orchestra/page.tsx` | 三栏布局（左 Recent / 中 Chat / 右 Context），`readyWorkflowId` 监听 |
| `app/(app)/workflows/page.tsx` | 直接挂 `<WorkflowCanvas />` |
| `app/globals.css` | **设计 token v2**（5 档 surface / 8 档 brand / 4 档 radius / 5 档 elevation / 玻璃态 / grain） |
| `components/orchestra/ChatThread.tsx` | 流式渲染消息、EmptyState chips、发送按钮 |
| `components/orchestra/ContextPanel.tsx` | 右栏 View union 导航壳（`lint:36` 有历史 setState-in-effect 问题待修） |
| `components/orchestra/context/*.tsx` | 8 个 drill-in 视图组件（见 Phase 2.5 归档） |
| `components/workflows/WorkflowCanvas.tsx` | React Flow 画布，读 `workflowStore.workflow` 渲染节点 |
| `components/workflows/TaskNodeCard.tsx` | 自定义 React Flow 节点，含 status / accent / AI 下拉 |
| `components/workflows/NodeDetailDrawer.tsx` | 侧抽屉，Config/Permissions/Sub-Agent Chat 三 tab（多数 mock） |
| `stores/orchestraStore.ts` | Orchestra 页 + Context 右栏的唯一事实来源 |
| `stores/workflowStore.ts` | Workflows 画布唯一事实来源 |
| `hooks/useSocket.ts` | Socket.io 事件绑定 → orchestraStore/workflowStore（Phase 2.6 已瘦身） |
| `lib/socket.ts` / `lib/api.ts` / `lib/utils.ts` | Socket 单例 / REST helpers / `cn()` |
| `types/workflow.ts` | `Workflow` / `WorkflowNode` / `NodeStatus` TS 类型 |

### 5.3 后端热文件（路径相对 `backend/`）

| 文件 | 职责 |
|------|------|
| `main.py` | FastAPI + Socket.io ASGI 入口，所有 `chat_send` / `chat_confirm_start` / `join_session` handler |
| `services/conversation_manager.py` | `ConversationState` dataclass + per-session CRUD |
| `services/orchestrator_agent.py` | Intent 路由（Haiku 4.5） |
| `services/clarifier_agent.py` | 多轮澄清 + plan 生成（Sonnet 4.6） |
| `services/workflow_designer.py` | 工作流 JSON 生成（Sonnet 4.6） |
| `services/workflow_db.py` | `WorkflowRecord` CRUD，含关键 fix `_coerce_created_at`（DateTime ↔ ISO string） |
| `models/chat.py` | `ClarificationQuestion / PlanPayload / BuildingLog / HistoryEntry` Pydantic 模型 |
| `models/db.py` | SQLAlchemy ORM |
| `routers/workflow.py` | `GET /api/workflow/{id}`、`PATCH /api/workflow/{id}/node/{node_id}` |

### 5.4 Stub 文件（Phase 2.6 置为 `@deprecated`，可安全删除）

```bash
cd frontend && rm -rf components/workflow components/chat stores/chatStore.ts
```

**不要**再去读这些路径下的文件——它们只有 `export {}`。唯一事实来源：
- 工作流画布 → `components/workflows/` 四件套
- Orchestra 聊天 → `components/orchestra/ChatThread.tsx`
- 通用 chat store → `stores/orchestraStore.ts`（不是 `chatStore`）

---

## 6. 沙箱 / 环境约束（避免踩坑）

| 事项 | 约束 |
|------|------|
| `rm` 删除文件 | Cowork 沙箱不允许，需 `mcp__cowork__allow_cowork_file_delete` 交互审批。**无人值守模式下只能 stub 化** |
| `WebFetch` Figma | `www.figma.com` 在 egress 黑名单（`EGRESS_BLOCKED`），**不要**尝试用 bash/curl/python 绕过（违反 web_content_restrictions） |
| `Write` 工具 | 必须先 `Read` 目标文件（哪怕只读 3 行）才能 `Write` 覆盖 |
| 前端 lint / type check | `cd frontend && npx tsc --noEmit` / `npx eslint . --quiet` |
| 后端测试 | `cd backend && pytest`（Phase 3 已有 5 个测试文件） |

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

> **先读本文件，再读 `phase-history-and-handoff.md`，然后直接跳到你要做的 Phase 对应的章节。** 不要再去读 legacy `components/workflow/` 和 `components/chat/` 下的文件——那些是 stub，里面只有 `export {}`。工作流画布的唯一事实来源是 `components/workflows/` 四件套 + `stores/workflowStore.ts`。
