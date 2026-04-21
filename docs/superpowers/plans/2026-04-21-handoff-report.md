# 2026-04-21 — OrchestrAI 交付快照 & 上下文核心信息

> **用途**：本文件为 **agent-to-agent 交接报告**。任何后续 agent（包括其他对话分支的 AI）**只需读这一份文件即可快速获取项目核心上下文**，无需重新扫描全部代码。
>
> **状态锚点**：Phase 3（Orchestra 接线）+ Phase 2.6（前端结构清理 + 视觉质感升级）均已完成。下一步 = Phase 4（Workflows 画布功能接线）。
>
> **最近一次更新**：2026-04-21（完成 Phase 2.6 UI polish + 结构清理）

---

## 0. 速览（30 秒理解项目）

**OrchestrAI** = AI 工作流编排平台 Demo。用户用自然语言描述目标 → Orchestrator(Haiku) 识别意图 → Clarifier(Sonnet) 多轮澄清并呈现 plan → 用户 confirm → WorkflowDesigner(Sonnet) 生成可视化工作流（React Flow 画布）→ 每个节点可换不同 AI 模型 → Phase 6 执行引擎负责跑。

**暖色设计系统**（牛奶咖色 canvas + 琥珀橘 brand），"编排交响乐团"的视觉隐喻。

**当前可用路径**：`/dashboard`（落地页）、`/orchestra`（三栏编排，核心）、`/workflows`（画布）、`/marketplace` `/arena` `/team` `/settings`（占位）。

---

## 1. Phase 状态总览

| Phase | 名称 | 状态 | 说明 |
|-------|------|------|------|
| 1 | 核心脚手架 + 分屏 | ✅ | Next.js + FastAPI + Socket.io + Zustand + React Flow |
| 1.5 | Docker Compose + DB | ✅ | PostgreSQL 16 + async SQLAlchemy |
| 2 | 设计系统 v1 + App Shell | ✅ | 暖色主题 + 3 路由骨架 |
| 2.5 | Orchestra 右栏重构 | ✅ | 4 竖排 drill-in + View union（2026-04-17） |
| **3** | **Orchestra 功能接线** | ✅ | 3 Agent + ConversationState + Socket.io 事件链端到端 |
| **2.6** | **UI 清理 + 视觉质感升级** | ✅ | 本次交付（2026-04-21） |
| 4 | Workflows 画布接线 | 🔲 | **下一个 agent 的工作** |
| 5 | Sub-chat + File Repo | 🔲 | |
| 6 | 节点执行引擎 | 🔲 | API → Playwright → Claude 模拟三层降级 |
| 7 | 多 AI 扇出 + 双语 + 打磨 | 🔲 | |

---

## 2. 本次（Phase 2.6）交付清单

### 2.1 结构清理（stub 化）

由于 Cowork 沙箱不允许 `rm` 删除文件（需用户审批），统一**把 legacy 文件内容替换为 `@deprecated` 注释 + `export {}`**。下个 agent 可一次性物理删除：

```bash
cd frontend
rm -rf components/workflow components/chat stores/chatStore.ts
```

被 stub 化的文件：

| 路径 | 原功能 | 替代 |
|------|--------|------|
| `components/workflow/WorkflowPanel.tsx` + 5 同目录文件 | 旧 React Flow 画布容器 | `components/workflows/WorkflowCanvas.tsx` |
| `components/chat/*.tsx`（4 文件） | 旧通用 chat 组件 | `components/orchestra/ChatThread.tsx` |
| `stores/chatStore.ts` | 通用 chat messages store | `stores/orchestraStore.ts` |

### 2.2 useSocket 瘦身

`hooks/useSocket.ts` 原同时向 `chatStore`（死码）和 `orchestraStore` 分发事件。已移除：
- `import { useChatStore }`、`const { addMessage, appendToken, commitStreaming, setTyping } = useChatStore()`
- `chat:typing` 回调
- 所有对 `chatStore` 的冗余写入

保留 `orchestraStore` + `workflowStore` 作为唯一订阅源。

### 2.3 设计系统 v2（`app/globals.css`）

| 维度 | v1 | v2 |
|------|----|----|
| Surface | 3 档 | **5 档**：`--canvas` / `--canvas-soft` / `--surface-subtle` / `--surface` / `--surface-raised` |
| Hairline | 单色 `#e7e5e4` | **双档暖棕**：`--hairline: #eae3d6` + `--hairline-strong: #d9cfbd` |
| Brand | 4 档 | **8 档**：`--color-brand-50` → `--color-brand-800` |
| Radius | 5 档混用 | **收敛 4 档**：`sm 8 / md 12 / lg 16 / xl 20` |
| 字号 | 9 档 | **收敛 5 档**：11 micro / 12 caption / 13 body / 15 lead / 18 title |
| Elevation | 1 层几乎不可见 | **5 档**：`xs / sm / md / lg / xl` + `--glow-brand*`（双层 inset highlight + outer glow） |
| 纹理 | 无 | **`--grain` SVG noise** + `.texture-grain::after` utility |
| 玻璃态 | 无 | **`.bg-glass` / `.bg-glass-surface`**（backdrop-blur + color-mix） |
| Motion | 一次性关键帧 | **`soft-pulse`** 替代 jarring `ping` + **`sheen`** 扫光；全局 `@media (prefers-reduced-motion: reduce)` |

### 2.4 12 核心组件升级

| 组件 | 核心改动 |
|------|---------|
| `layout/AppSidebar` | 玻璃态、spring hover logo、`layoutId` active 动画、渐变 icon tile、Pro Plan 径向光晕 |
| `layout/TopBar` | 玻璃态、bell `soft-pulse`、token pill 双渐变、avatar 径向高光 |
| `dashboard/HeroCard` | ambient orbs、反向旋转 orbit rings、中心立方体 `sheen`、品牌按钮 hover sheen |
| `dashboard/StatCard` | 渐变 icon tile、hover tonal glow、`delta` 字段、字号统一、`tabular` 数字 |
| `dashboard/ProjectCard` | `hover-lift`、`soft-pulse` 在线徽章、Play 按钮暖色渐变 + glow |
| `orchestra/ChatThread` | 玻璃态 header + composer、spring 气泡、渐变 avatar + ring、EmptyState chips、`shadow-brand-glow` 发送按钮 |
| `orchestra/ContextPanel` | 玻璃态背景、uppercase tracking label |
| `orchestra/context/OverviewList` | stagger 进场、hover glow、全渐变 icon tile、Live `soft-pulse` |
| `orchestra/RecentProjectsPanel` | 新建按钮 sheen、`layoutId` active 连续动画、active 渐变 icon |
| `workflows/WorkflowCanvas` | 玻璃态工具栏、深色双层阴影 Save、dot 背景暖色（`#d9cfbd` gap 26）、放大 Empty State |
| `workflows/TaskNodeCard` | 渐变 accent 条、卡片宽 +16 px、选中双层阴影 + brand ring、hover glow、floating dropdown |
| `workflows/NodeDetailDrawer` | 玻璃态 + overlay 阴影、uppercase caps model chip |

### 2.5 验证结果

| 命令 | 结果 |
|------|------|
| `npx tsc --noEmit` | ✅ exit 0（本次改动 0 新增类型错误） |
| `npx eslint . --quiet` | ✅ exit 0（残留 2 个 Phase 3 历史 lint 错误，非本次引入） |

残留 lint 错误（待 Phase 4 agent 顺手修）：
1. `components/orchestra/ContextPanel.tsx:36` — `pendingPanelView` 的 effect 存在 `setState in effect` 反模式
2. `stores/workflowStore.ts:83` — `as any` 类型（需改正确泛型）

### 2.6 关键兼容性备注

- 本次改动**未触碰任何后端代码**，Phase 3 端到端流程不受影响
- `globals.css` 所有新 CSS var 是 **additive** 的（只新增，没重命名或移除旧 token），即便某处仍引用旧变量也不会崩
- 所有 stub 文件都保留 `@deprecated` 注释，物理删除之前可反复检索

---

## 3. 关键文件总结（供下个 agent 快速定位）

> 以下为需要高频访问的"热文件"，路径相对 `frontend/` 或 `backend/`。

### 3.1 前端 / 入口 & 路由

| 文件 | 职责 | Phase 4 需关注的点 |
|------|------|-------------------|
| `app/(app)/layout.tsx` | AppSidebar + TopBar 壳 | — |
| `app/(app)/orchestra/page.tsx` | 三栏布局（左 Recent / 中 Chat / 右 Context），`readyWorkflowId` 监听（当前仅 `console.log`） | **改为 `router.push('/workflows?wf=' + readyWorkflowId)`** |
| `app/(app)/workflows/page.tsx` | 直接挂 `<WorkflowCanvas />` | **接住 `?wf=` query，驱动 `workflowStore.loadWorkflow(id)`** |
| `app/(app)/dashboard/page.tsx` | HeroCard + 4 StatCard + 2 ProjectCard（纯展示） | — |

### 3.2 前端 / 核心组件

| 文件 | 当前行为 | Phase 4 需扩展 |
|------|---------|---------------|
| `components/workflows/WorkflowCanvas.tsx` | 读 `workflowStore.workflow` 渲染节点；`buildFlowNodes/Edges` 用 order 递增 x，奇偶 y 抖动；点节点 → `setSelected({ id, title, modelLabel })`（仅 3 字段） | **selected 扩展到 `NodeDetail` 包含 `description / prompt / execution_method / tools_used`** |
| `components/workflows/TaskNodeCard.tsx` | 自定义 React Flow 节点，支持 `status: queued/running/complete`、`accent`、`assignedAi`、`onModelChange` dropdown | **接 `execution:*` socket 事件 → `status` 自动驱动颜色** |
| `components/workflows/NodeDetailDrawer.tsx` | 两个 Tab：Configurations & Permissions（**全部 mock**） + Sub-Agent Chat（**纯本地 state**） | **Config Tab 接真数据；Chat Tab 待 Phase 5 接 sub-chat 后端** |
| `components/workflows/Breadcrumbs.tsx` | 渲染 `{ label, href? }[]`，`href` 点击是死链 | **`href` 接入 Next.js `<Link>` 或 `router.push`** |
| `components/orchestra/ChatThread.tsx` | 流式渲染消息、EmptyState chips、发送按钮写入 `socket.emit('chat_send')` | — |
| `components/orchestra/ContextPanel.tsx` | View union 导航壳，`lint:36` 有历史 `setState in effect` 问题 | **顺手改为在 orchestraStore setter 里同步 view** |
| `components/orchestra/context/OverviewList.tsx` | 4 张 drill-in 入口卡 | — |
| `components/orchestra/RecentProjectsPanel.tsx` | Recent Projects 列表 + "New Project" CTA | **CTA 应触发重置 orchestraStore.sessionId / 新建会话** |

### 3.3 前端 / State（Zustand）

| store | 关键字段 | 用途 |
|-------|---------|------|
| `stores/orchestraStore.ts` | `sessionId`、`messages[]`、`clarifications{}`、`buildingLogs[]`、`pendingPanelView`、`readyWorkflowId` | Orchestra 页面 + Context 右栏的唯一来源 |
| `stores/workflowStore.ts` | `workflow: Workflow | null`、`workflowId`、`swapNodeModel(nodeId, model)`、`setWorkflow(wf)` | Workflows 画布唯一来源 |
| `stores/chatStore.ts` | **stub** | @deprecated，可删 |

### 3.4 前端 / 基础设施

| 文件 | 职责 |
|------|------|
| `lib/socket.ts` | Socket.io 单例 `getSocket()` |
| `lib/api.ts` | REST helpers：`getWorkflow(id)`、`updateNodeModel(wfId, nodeId, model)` |
| `lib/utils.ts` | `cn()` + 通用 utility |
| `hooks/useSocket.ts` | 绑定 `chat:*` `clarification:*` `building:*` `workflow:ready` → orchestraStore/workflowStore（**已瘦身，只订阅这两个 store**） |
| `app/globals.css` | **设计 token v2**（详见 2.3） |
| `types/workflow.ts` | `Workflow` / `WorkflowNode` / `NodeStatus` TS 类型 |

### 3.5 后端（本次未动，Phase 3 产出）

| 文件 | 职责 |
|------|------|
| `backend/main.py` | FastAPI + Socket.io ASGI 入口，所有 `chat_send / chat_confirm_start / join_session` handler |
| `backend/services/orchestrator_agent.py` | Intent 路由，Haiku 4.5 |
| `backend/services/clarifier_agent.py` | 多轮澄清 + plan 生成，Sonnet 4.6 |
| `backend/services/workflow_designer.py` | 工作流 JSON 生成，Sonnet 4.6 |
| `backend/services/conversation_manager.py` | `ConversationState` dataclass + per-session 状态机 |
| `backend/services/workflow_db.py` | `WorkflowRecord` CRUD，含关键 fix `_coerce_created_at`（`DateTime ↔ ISO string`） |
| `backend/models/db.py` | SQLAlchemy ORM |
| `backend/routers/workflow.py` | `GET /api/workflow/{id}`、`PATCH /api/workflow/{id}/node/{node_id}` |

### 3.6 规划文件（最重要）

| 文件 | 何时读 |
|------|--------|
| `docs/superpowers/plans/project-phases-overview.md` | **每次开工第一件事** — 确认当前 Phase 状态 |
| `docs/superpowers/plans/2026-04-21-handoff-report.md` | **本文件** — 核心上下文 |
| `docs/superpowers/plans/2026-04-21-ui-polish-cleanup.md` | Phase 2.6 详细 plan |
| `docs/superpowers/plans/phase3-orchestra-wiring.md` | Phase 3 接线全貌 |
| `docs/superpowers/plans/2026-04-17-orchestra-context-panel-redesign.md` | Phase 2.5 Context 右栏重构 |

---

## 4. 核心架构决策（一次性讲清楚）

### 4.1 三 Agent 模型

| Agent | 模型 | 触发 | 职责 |
|-------|------|------|------|
| Orchestrator | Haiku 4.5 | 每次 `chat_send` 第一个被调用 | 仅做 intent 二分：`casual_chat` / `development_request` |
| Clarifier | Sonnet 4.6 | 识别为 `development_request` 后 | 多轮提问 → 聚合 → 生成 plan（`clarification:plan_ready` 事件） |
| Workflow Designer | Sonnet 4.6 | 用户 `chat_confirm_start` 后 | 生成工作流 JSON，流式下发 `building:log`、最后 `workflow:ready` |

### 4.2 ConversationState 状态机（后端内存，per session_id）

```
idle → clarifying → awaiting_confirm → generating → complete
                ↑            ↓
                └─ re-ask ←──┘  （用户继续追问）
```

**重要**：`ConversationState` 不持久化到 DB（是后端进程内存 dict）。`WorkflowRecord` 和 `ChatMessageRecord` 才进 PostgreSQL。Demo 重启无历史是设计上的妥协。

### 4.3 Socket.io 事件契约

```
Client → Server
  chat_send              { session_id, message }
  chat_confirm_start     { session_id }
  join_session           { session_id }

Server → Client
  chat:stream_token      { session_id, token, sender }     # 增量流
  chat:stream_complete   { session_id, message_id, sender }
  clarification:update   { session_id, question, options }
  clarification:plan_ready { session_id, plan }            # 用户需 confirm
  building:log           { session_id, node_id, agent, content }
  building:complete      { session_id, workflow_id }
  workflow:ready         { session_id, workflow_id }       # 触发前端跳 /workflows
```

### 4.4 设计系统铁律

- **绝不回到 v1 的单一色 hairline**，所有边界统一用 `border-hairline` / `border-hairline-strong`
- **不再用 Tailwind 的 `shadow-sm/md/lg`**，全部用 `shadow-card/card-md/elevated/floating/overlay`
- **圆角只用 4 档**：`rounded-[8px|12px|16px|20px]` 或 `rounded-sm/md/lg/xl`
- **动画优先 `soft-pulse` 不用 `ping`**（后者视觉过锐）
- **玻璃面板**：`bg-glass` 用于 sidebar 等大面积，`bg-glass-surface` 用于 drawer 等浮层

---

## 5. 下一个 Agent 的首要任务（Phase 4）

**优先级从高到低：**

### 5.1 物理删除 stub 文件（一次性）
```bash
cd frontend
rm -rf components/workflow components/chat stores/chatStore.ts
```

### 5.2 修两个历史 ESLint 错误
- `components/orchestra/ContextPanel.tsx:36` — 移掉 effect 里的 `setState`，改在 orchestraStore 的 `setPendingPanelView` setter 里直接更新 view
- `stores/workflowStore.ts:83` — 把 `as any` 替换成正确的泛型

### 5.3 Phase 4 画布功能接线（核心）

**P0** — 工作流数据流打通
- `orchestra/page.tsx` 第 39-43 行的 `readyWorkflowId` 监听：由 `console.log` 改为 `router.push('/workflows?wf=' + readyWorkflowId)`
- `workflows/page.tsx`：`useSearchParams` 拿 `wf`，调 `loadWorkflow(id)`（在 workflowStore 里新增 action，内部调 `getWorkflow(id)` REST）

**P1** — NodeDetailDrawer 接真数据
- 扩展 `NodeDetail` 类型：`{ id, title, modelLabel, description, prompt, execution_method, tools_used[] }`
- `WorkflowCanvas.onNodeClick` 里从 `workflow.nodes` 找到完整节点数据传入
- `NodeDetailDrawer` 的 Config Tab 替换 mock（plugins / skills / permissions）为真实字段（可先只显示 description / prompt，其它字段后端尚未产出）

**P2** — 节点实时状态
- `workflowStore` 新增 `updateNodeStatus(nodeId, status)` action
- `useSocket.ts` 订阅 `execution:start / execution:complete / execution:error`（Phase 6 会发这些事件，Phase 4 可先 mock）
- `TaskNodeCard` 的 `status` 已支持 queued/running/complete，无需改 UI

**P3** — Breadcrumbs 可点
- `Breadcrumbs.tsx` 把 `span` + `href` 改成 `<Link href={item.href}>` 当 `item.href` 存在
- `WorkflowCanvas` 里 crumbs 第一项 `href: '/workflows'` 需要实际路由存在 → **触发 P4**

**P4** — 新建 `/workflows` 列表页
- 后端 REST：`GET /api/workflows` 返回当前用户所有 workflow（后端已有 `workflow_db.list_workflows()`，需包一个 router）
- 前端：`app/(app)/workflows/page.tsx` 改为列表视图，网格卡片（复用 `ProjectCard` 样式）
- `app/(app)/workflows/[id]/page.tsx` 新建，挂 `<WorkflowCanvas />` + 从 URL 拿 id

---

## 6. 沙箱 / 环境约束（重要，避免踩坑）

| 事项 | 约束 |
|------|------|
| `rm` 删除文件 | Cowork 沙箱不允许，需要 `mcp__cowork__allow_cowork_file_delete` 交互审批。**无人值守模式下只能 stub 化** |
| `WebFetch` Figma | `www.figma.com` 在 egress 黑名单（`EGRESS_BLOCKED`），**不要** 尝试用 bash/curl/python 绕过（违反 web_content_restrictions） |
| `Write` 工具 | 必须先 `Read` 目标文件（哪怕只读 3 行）才能 `Write` 覆盖 |
| ESLint/tsc | 项目根是 `frontend/`，`cd frontend && npx tsc --noEmit` / `npx eslint . --quiet` |
| 后端测试 | `backend/` 里 `pytest`，Phase 3 已有 5 个测试文件 |

---

## 7. 给继任 Agent 的一句话建议

> **先读这份报告，再读 `project-phases-overview.md`，然后直接跳到你要做的 Phase 对应的 plan 文件。** 不要再去读 legacy `components/workflow/` 和 `components/chat/` 下的文件——那些是 stub，里面只有 `export {}`。工作流画布的唯一事实来源是 `components/workflows/` 四件套 + `stores/workflowStore.ts`。

---

## 8. 相关文档索引

- 总 Phase 规划：`docs/superpowers/plans/project-phases-overview.md`
- Phase 2.6 详细 plan：`docs/superpowers/plans/2026-04-21-ui-polish-cleanup.md`
- Phase 3 wiring plan：`docs/superpowers/plans/phase3-orchestra-wiring.md`
- Phase 2.5 context redesign：`docs/superpowers/plans/2026-04-17-orchestra-context-panel-redesign.md`
- 根 README：`README.md`（路由/架构/tech stack/Project Structure）
