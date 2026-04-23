# OrchestrAI — Phase 历史归档 & 交接手册

> **用途**：记录已完成 Phase 的关键决策、交付清单、验证结果，以及下一个 Agent 需要接手的任务。
>
> **前置阅读**：`project-overview.md`（项目速览 + Phase 路线图 + **Harness 六维度铁律**）。本文件侧重"发生了什么"和"接下来做什么"，不重复总览信息。
>
---

## Phase 2.5 — Orchestra Context Panel 重构（2026-04-17）

**状态**：✅ 完成
**范围**：`/orchestra` 右栏"Project Context" 从 tab 切换改为 stack-based drill-in 导航。

### 设计决策

- **文件布局**：拆成 `components/orchestra/context/` 子目录，每个视图一个文件（拒绝单文件 700+ 行，也拒绝 `<Stack>` 抽象 YAGNI）
- **导航状态**：本地 `useState<View>`，无 Zustand。Phase 3 若需跨组件再升级
- **back 语义**：`goBack(to: View)` 显式传目标，不维护隐式 history stack（7 视图的小图不值得）
- **动画**：`AnimatePresence mode="wait"` + `slide` 变体，`direction: 1 | -1` 驱动方向，曲线 `[0.22, 1, 0.36, 1]`，时长 0.22s（对齐外层面板折叠）

### View union 定义

```ts
type View =
  | { name: 'overview' }
  | { name: 'clarifications' }
  | { name: 'clarification-agent'; agentId: string }
  | { name: 'building' }
  | { name: 'building-agent'; agentId: string }
  | { name: 'reports' }
  | { name: 'history' };
```

### 导航图

```
overview
├── clarifications ──► clarification-agent (per agent)
├── building ──────── ► building-agent (per agent)
├── reports
└── history
```

### 新增 / 修改文件

| 文件 | 动作 |
|------|------|
| `components/orchestra/ContextPanel.tsx` | **重写**：shell + view router + AnimatePresence slide |
| `components/orchestra/context/DetailHeader.tsx` | 新增：back + title，所有 detail 视图复用 |
| `components/orchestra/context/OverviewList.tsx` | 新增：4 张 drill-in 卡（Clarifications / Building / Reports / History） |
| `components/orchestra/context/ClarificationsList.tsx` | 新增：per-agent 列表（GPT/Claude 双 tone） |
| `components/orchestra/context/ClarificationDetail.tsx` | 新增：per-agent 决策 radio 卡 |
| `components/orchestra/context/BuildingProcessList.tsx` | 新增：per-agent 进度条 + 状态 chip（Waiting/Running） |
| `components/orchestra/context/BuildingAgentDetail.tsx` | 新增：Activity Log（终端面板）+ Pending Approvals |
| `components/orchestra/context/AgentReports.tsx` | 新增：Artifact report 卡片（内容来自旧 `AgentReportsTab`） |
| `components/orchestra/context/HistoryTimeline.tsx` | 新增：时间线 + 每条 Undo/Redo（之前 Undo 在 chat composer） |
| `components/orchestra/ChatThread.tsx` | 修改：移除 Undo 按钮 + `onUndo`/`canUndo` 属性 + `CornerUpLeft` import |

### 关键 seed 数据（开发时需保持契约一致）

```ts
// Clarifications
[
  { id: 'gpt-5-4',     name: 'GPT-5.4',   role: 'Strategist', tone: 'green',
    task: 'Weather API & Deployment Strategy', pending: 1 },
  { id: 'claude-4-6',  name: 'Claude-4.6',role: 'Architect',  tone: 'orange',
    task: '3D Rendering Engine Selection',     pending: 1 },
]

// Building Process
[
  { id: 'claude-4-6', name: 'Claude-4.6', tone: 'orange',
    task: 'Environment & Deployment Config', status: 'waiting', progress: 40, approvals: 2 },
  { id: 'deepseek',   name: 'DeepSeek',   tone: 'teal',
    task: 'Component Architecture & UI',    status: 'running', progress: 65, approvals: 1 },
]

// History
[
  { id: 'h1', label: 'API Provider Selected',       time: '10:44 AM', reversible: true,  undone: false },
  { id: 'h2', label: 'Vercel Deployment Confirmed', time: '10:43 AM', reversible: true,  undone: false },
  { id: 'h3', label: 'Workflow Generated',          time: '10:42 AM', reversible: true,  undone: false },
  { id: 'h4', label: 'Project Initiated',           time: '10:41 AM', reversible: false, undone: false },
]
```

### 可访问性要求（延续至 Phase 3+）

- 所有 drill-in 卡是 `<button>`，带 `focus-visible:ring-2 focus-visible:ring-brand-500`
- `DetailHeader` back 按钮带 `aria-label="Back"`
- 状态 chip 不依赖单色，文本必须能独立表意
- 终端面板 `role="log"` + `aria-live="polite"`（给 cursor 行）
- 已 undone 的历史卡 `aria-label` 追加 "(undone)"

### 超出范围（留给后续 Phase）

- Clarifications Confirm → WebSocket event（Phase 3 完成）
- Building Process Approve/Deny → agent-command dispatch（Phase 4.5 HITL approval 框架实现）
- 真实 activity log 流（Phase 6 节点执行时真实下发）
- 真实 Undo/Redo 绑到应用状态 stack（依赖 Phase 4.5 checkpoint）
- View stack deep-linking / URL state（未规划）

---

## Phase 3 — The Orchestra 功能接线

**状态**：✅ 完成
**范围**：把整个 Orchestra 页面从静态 mock 接通到真实 AI 产出。交付成果：用户输入"帮我创建建模工作流" → 经过澄清确认流程 → Workflows 页出现真实工作流。

### 架构总览

```
用户输入
  ↓ chat_send (Socket.io)
[ConversationManager] 查当前 session 状态
  ├── idle → OrchestratorAgent 判断
  │     ├── casual_chat → Claude 直接流式回复
  │     └── development_request → ClarifierAgent，state→clarifying
  ├── clarifying → ClarifierAgent 处理用户回答
  │     ├── 还需澄清 → 继续提问，emit clarification:update
  │     └── 信息足够 → 呈现 plan，state→awaiting_confirm，emit clarification:plan_ready
  └── awaiting_confirm → 等待 chat_confirm_start
        ↓ state→generating
        ↓ WorkflowDesigner 生成
        ↓ emit building:started / building:log × N / building:complete
        ↓ 存 DB, emit workflow:ready {workflow_id}
        ↓ state→complete
```

### 新增后端文件

| 文件 | 职责 | 模型 |
|------|------|------|
| `backend/services/conversation_manager.py` | `ConversationState` dataclass + CRUD，per session_id 内存 dict | — |
| `backend/services/orchestrator_agent.py` | intent 二分路由 | claude-haiku-4-5-20251001 |
| `backend/services/clarifier_agent.py` | 多轮澄清 + plan 呈现 | claude-sonnet-4-6 |
| `backend/services/workflow_designer.py` | 工作流 JSON 生成 | claude-sonnet-4-6 |

### 修改后端文件

| 文件 | 变更 |
|------|------|
| `backend/main.py` | 重写 `chat_send` 走状态机；新增 `chat_confirm_start`；新增 `_stream_casual_reply`；删除旧的直接调用 `generate_workflow_and_respond` |
| `backend/models/chat.py` | 新增 MessageType 值：`clarification / plan_ready / building`；新增 Pydantic 模型：`ClarificationQuestion / PlanNode / PlanPayload / BuildingLog / HistoryEntry` |
| `backend/services/workflow_db.py` | 新增 `_coerce_created_at`：修复 `WorkflowRecord.created_at`(DateTime) 与 `Workflow.created_at`(ISO string) 类型不匹配，有对应测试 `test_workflow_db.py` |

### 新增前端文件

| 文件 | 职责 |
|------|------|
| `frontend/stores/orchestraStore.ts` | Orchestra 页面唯一事实来源：`sessionId` / `convState` / `messages[]` / `streamingBuffers` / `clarificationQuestions` / `plan` / `buildingLogs[]` / `historyEntries` / `readyWorkflowId` / `pendingPanelView` |

### 修改前端文件

| 文件 | 变更 |
|------|------|
| `frontend/hooks/useSocket.ts` | 新增 8 个 listener：`chat:stream_start/token/end` + `clarification:update/plan_ready` + `building:started/log/complete` + `workflow:ready` + `history:update` |
| `frontend/app/(app)/orchestra/page.tsx` | sessionId 初始化（localStorage），`join_session`，监听 `pendingPanelView` 驱动右栏切换 |
| `frontend/components/orchestra/ChatThread.tsx` | 接 `orchestraStore.messages`；流式 token 追加 streamingBuffers；发送 `socket.emit('chat_send', {content, session_id})`；`convState === 'generating'` 时禁用输入 |
| `frontend/components/orchestra/context/ClarificationsList.tsx` | 双视图（澄清 / 确认），确认态底部加"开始生成"按钮 → `socket.emit('chat_confirm_start')` |
| `frontend/components/orchestra/context/BuildingProcessList.tsx` | 真实日志 + 粗粒度进度条，`isBuildingComplete` 时进度条变绿 |
| `frontend/components/orchestra/context/OverviewList.tsx` | 4 张卡 badge 动态来自 store |
| `frontend/components/orchestra/context/HistoryTimeline.tsx` | 读 `historyEntries`（真实数据替换静态），Undo/Redo 按钮 Phase 3 暂 disabled |

### 技术难点与应对

| 难点 | 方案 |
|------|------|
| 流式 + 结构化数据同步 | 后端**完整接收** stream 再解析 JSON；tokens 只给 ChatThread 做"打字感"，不实时解析避免残缺 JSON |
| LLM JSON 偶发不完整 | 正则提取 `{...}` 块，失败 fallback 到 `{action:"ask", questions:[{id:"fallback",...}]}`，**永不崩溃** |
| 右栏自动切换解耦 | `orchestraStore.pendingPanelView` + `page.tsx` useEffect 监听，清空后驱动 |
| 确认阶段用户改主意 | state 回退到 `clarifying`，Clarifier 重新评估，可能继续追问或 re-present_plan |
| workflow_id 跨页面共享 | `orchestraStore.readyWorkflowId` 全局存储 + 路由 `?wf=id` 作为 fallback |

### 本 Phase 不动

- `backend/services/executor.py` → Phase 6
- `backend/routers/execution.py` → Phase 6
- `frontend/components/orchestra/context/ClarificationDetail.tsx` → Phase 10
- `frontend/components/orchestra/context/BuildingAgentDetail.tsx` → Phase 10
- `frontend/components/workflows/` → Phase 4（仅 `workflow:ready` 触发导航即可）

### 验证通过路径

| 测试路径 | 预期结果 |
|---------|---------|
| 输入"你好" | ChatThread 流式回复，右栏不变，state 保持 idle |
| 输入"帮我创建建模工作流" | 右栏切到 Clarifications，出现 2-4 个问题 |
| 回答问题后 | Clarifier 呈现计划，右栏显示"开始生成"按钮 |
| 点"开始生成" | 右栏切到 Building Process，日志条目出现 |
| 生成完成 | Toast 提示，`/workflows` 可见工作流节点 |
| 确认阶段发"改一下" | state 回退 clarifying，重新澄清 |
| History tab | 完整时间线（用户消息 / 确认 / 生成等条目） |

---

## Phase 2.6 — 前端清理 + 视觉升级（2026-04-21）

**状态**：✅ 完成
**定位**：Phase 2 设计系统的延续、Phase 3 接线结束后的"收尾打磨"。
**核心目标**：
1. 合并 legacy `components/workflow/` 与 current `components/workflows/`，让前端只保留一套工作流画布
2. 清理 Phase 3 改造后遗留的旧 chat 组件
3. 对照 Figma 暖色原型做一次整体视觉升级，解决"组件风格不够有质感、页面廉价"的问题

### 结构清理（stub 化，非物理删除）

由于 Cowork 沙箱不允许 `rm`（需用户交互审批），统一**把 legacy 文件内容替换为 `@deprecated` 注释 + `export {}`**。下次人工或 CI 一次性删除：

```bash
cd frontend
rm -rf components/workflow components/chat stores/chatStore.ts
```

被 stub 化的文件：

| 路径 | 原功能 | 替代 |
|------|--------|------|
| `components/workflow/WorkflowPanel.tsx`（+ 5 同目录） | 旧 React Flow 画布容器 | `components/workflows/WorkflowCanvas.tsx` |
| `components/chat/*.tsx`（4 文件） | 旧通用 chat 组件 | `components/orchestra/ChatThread.tsx` |
| `stores/chatStore.ts` | 通用 chat messages store | `stores/orchestraStore.ts` |

### `hooks/useSocket.ts` 瘦身

原代码同时向 `chatStore`（死码）和 `orchestraStore` 分发 `chat:*` 事件。已移除：
- `import { useChatStore }` 及相关解构
- `chat:typing` 回调
- 所有对 `chatStore` 的冗余写入

保留 `orchestraStore` + `workflowStore` 作为唯一订阅源。

### 设计 Token v1 → v2 对照（`app/globals.css` 全重写）

| 维度 | v1（旧） | v2（新） |
|------|----------|----------|
| Surface 层级 | 3 档（canvas / canvas-soft / surface） | **5 档**（+ `--surface-subtle` / `--surface-raised`） |
| Hairline | 单色 `#e7e5e4` | **双档暖棕**（默认 `#eae3d6` + `strong #d9cfbd`） |
| Brand 色阶 | 4 档（400/500/600/700） | **8 档**（50–800 完整色阶） |
| 圆角 | 5 档混用（10/12/14/16/24） | **收敛 4 档**（sm 8 / md 12 / lg 16 / xl 20） |
| 字号 | 9 档 `[11–15.5px]` 混用 | **收敛 5 档**（11 micro / 12 caption / 13 body / 15 lead / 18 title） |
| Elevation | 1 层几乎不可见 | **5 档**（xs/sm/md/lg/xl）+ `--glow-brand*`（双层 inset highlight + outer glow） |
| 纹理层 | 无 | `--grain` SVG noise + `.texture-grain::after` utility |
| 玻璃态 | 无 | `.bg-glass` / `.bg-glass-surface`（backdrop-blur + color-mix） |
| Motion | 一次性关键帧 | `soft-pulse`（替代 jarring `ping`）+ `sheen`；全局 `prefers-reduced-motion` |

### 12 核心组件视觉升级

| 组件 | 核心改动 |
|------|---------|
| `layout/AppSidebar` | 玻璃态；品牌 logo spring hover；nav active 用 `layoutId` 连续动画 + 渐变图标底；Pro Plan 卡径向光晕 |
| `layout/TopBar` | 玻璃态；notification 铃 `soft-pulse`；token pill 双渐变 + inner highlight；avatar 径向高光 |
| `dashboard/HeroCard` | 径向 ambient orbs；orbit rings 正反向旋转；中心立方体 `sheen` 扫光 + 双层阴影；品牌按钮 hover sheen |
| `dashboard/StatCard` | 图标 tile 渐变；hover tonal glow；支持 `delta` 字段；字号统一；`tabular` 数字 |
| `dashboard/ProjectCard` | `hover-lift` 抬升；在线徽章 `soft-pulse`；Play action 暖色渐变 + glow |
| `orchestra/ChatThread` | 头部 + composer 玻璃态；气泡 spring；avatar 渐变 + ring；EmptyState chips；发送按钮 `shadow-brand-glow` |
| `orchestra/ContextPanel` | 玻璃态背景；uppercase tracking label |
| `orchestra/context/OverviewList` | 卡片 stagger 进场；hover glow；图标 tile 全渐变；Live 徽章 `soft-pulse` |
| `orchestra/RecentProjectsPanel` | 新建按钮 sheen；`layoutId` active 连续动画 + 渐变图标底 |
| `workflows/WorkflowCanvas` | 工具栏玻璃态；深色按钮双层阴影；dot 背景暖色（`#d9cfbd` gap 26）；Empty State 放大 + 高光 |
| `workflows/TaskNodeCard` | accent 从纯色条改渐变条；卡片宽 +16 px；选中双层阴影 + brand ring；hover glow；floating dropdown；chevron 旋转 |
| `workflows/NodeDetailDrawer` | 抽屉玻璃态 + overlay 阴影；model chip uppercase caps |

### 验证结果

| 命令 | 结果 |
|------|------|
| `npx tsc --noEmit` | ✅ exit 0（0 新增类型错误） |
| `npx eslint . --quiet` | ✅ exit 0（残留 2 个 Phase 3 历史 lint 错误，非本次引入） |

**残留 lint 错误**（Phase 4 顺手修）：
1. `components/orchestra/ContextPanel.tsx:36` — `pendingPanelView` 的 effect 存在 `setState in effect` 反模式 → 建议移到 `orchestraStore.setPendingPanelView` setter 里直接同步
2. `stores/workflowStore.ts:83` — `as any` 类型 → 替换成正确的泛型

### 兼容性备注

- 本次改动**未触碰任何后端代码**，Phase 3 端到端流程不受影响
- `globals.css` 所有新 CSS var 是 **additive** 的（只新增、未重命名或移除旧 token），即便某处仍引用旧变量也不会崩
- 所有 stub 文件都保留 `@deprecated` 注释，物理删除前可反复检索

---

## Phase 4 — Workflows 画布功能接线（2026-04-24）

**状态**：🟡 部分完成（Step 1-5 ✅，Step 6 P3 节点实时状态延后到 Phase 4.5）
**范围**：关闭 Tier A UI 闭环——stub 物理清理、两条历史 lint、Orchestra → Canvas 跳转、`/workflows` 列表 + 详情路由、NodeDetailDrawer 接真数据。

### 本 Phase 对 Harness 六维度的贡献

| 维度 | 贡献 |
|------|------|
| ① 上下文 | — |
| ② 工具编排 | — |
| ③ 验证 | — |
| ④ 状态 | `workflowStore.loadWorkflow(id)`：支持 REST 去水化；"已有就跳过" 优化让 Orchestra → Canvas 不双拉数据 |
| ⑤ 可观测 | NodeDetailDrawer 把每节点的 `status / error / result.summary / result.raw / execution_method` 全量暴露给用户，便于排查节点失败原因 |
| ⑥ HITL | CTA "打开画布" 明确由用户触发跳转，不自动 redirect（避免对用户造成 "被带走" 的意外） |

### 设计决策

- **URL 方案改用路径参数**：原 handoff 建议 `/workflows?wf=<id>`，实际改为 `/workflows/[id]`，更符合 REST 语义；对应 `workflows/page.tsx` 改列表、`workflows/[id]/page.tsx` 新建详情
- **Orchestra → Canvas 不自动跳转**：用户可能想继续看 Building log，于是用 CTA 按钮（`isBuildingComplete && readyWorkflowId` 时出现）而非 useEffect redirect
- **NodeDetailDrawer 接口改 `nodeId`-only**：drawer 内部从 `workflowStore` selector 拿 live `WorkflowNode`，这样 `running → complete` 状态流会实时回流
- **ContextPanel view state 彻底提升到 store**：原 handoff 建议"在 setPendingPanelView setter 里直接更新"，实际采用更彻底的重构——把 `ContextView` 作为 discriminated union 存到 `orchestraStore.contextView`，ContextPanel 直接消费，消除 `useEffect + setState` 反模式
- **zustand `(set, get)` pattern**：`workflowStore.loadWorkflow` 避免自引用 `useWorkflowStore.getState()`（会触发 TS 循环推导把整个 store 打成 `any`），改用 zustand 的 `get()` + 显式返回类型标注
- **ESLint `react-hooks/set-state-in-effect`**：详情页 `workflows/[id]/page.tsx` 的 `ready/loading` 从 store 派生，只保留 `notFoundId` 一个 state 且仅在 `.then()` 异步 callback 里 set

### 新增 / 修改文件

#### 前端

| 文件 | 动作 |
|------|------|
| `stores/orchestraStore.ts` | **重构**：新增 `ContextView` discriminated union；把 `pendingPanelView` 替换为 `contextView: ContextView` + `contextDirection: 1 \| -1` + `setContextView(view, direction?)` action |
| `components/orchestra/ContextPanel.tsx` | **重写**：直接 subscribe `orchestraStore.contextView`，去掉 `useEffect + setState`，`nav.goTo/goBack` 直接调 `setContextView` |
| `stores/workflowStore.ts` | 新增 `loadWorkflow(id)` async action（有 "已加载就跳过" 优化，会重置 `newNodeIds/nodeLogs`）；`create` 改 `(set, get)` pattern；`updateNodeResult.method` 类型从 `string` 收紧为 `ExecutionMethod`，删掉 `as any` |
| `types/workflow.ts` | 新增 `toExecutionMethod()` type guard；新增 `WorkflowSummary` 接口（列表页用） |
| `lib/api.ts` | 新增 `listWorkflows() -> WorkflowSummary[]` |
| `hooks/useSocket.ts` | `setPendingPanelView('clarifications/building')` → `setContextView({name:...})`；`execution:node_complete` 用 `toExecutionMethod()` 收窄入参 |
| `app/(app)/workflows/page.tsx` | **重写**：从占位改列表视图（PageHeader + WorkflowGrid / LoadingSkeleton / EmptyState / ErrorState），卡片跳 `/workflows/[id]`，右上"New Workflow" → Orchestra |
| `app/(app)/workflows/[id]/page.tsx` | **新建**：详情页，三态渲染 `LoadingState / NotFoundState / WorkflowCanvas`；如果 store 已有目标 workflow 则直接复用不走 REST |
| `components/orchestra/context/BuildingProcessList.tsx` | 新增"打开画布 · Open Canvas" CTA（`isBuildingComplete && readyWorkflowId` 时出现），点击 `router.push(/workflows/${readyWorkflowId})` |
| `app/(app)/orchestra/page.tsx` | 清理占位 useEffect（注释里提到 `Phase 4 will navigate to /workflows?wf=...`，已被 CTA 取代） |
| `components/workflows/NodeDetailDrawer.tsx` | **重写**：接口从 `NodeDetail {id,title,modelLabel}` 改 `nodeId: string \| null`；内部 subscribe live node；两个 tab —— Details（描述 zh+en / Tool assignment / I/O schemas）、Result（按 status 分支：error/running/idle/complete + summary + execution_method + raw JSON）；header 加状态 chip |
| `components/workflows/WorkflowCanvas.tsx` | 适配 drawer 新接口：`selected: NodeDetail` → `selectedNodeId: string`；crumb 从 store 查当前 node 派生；删 `MODEL_LABEL` |

**实际未改动**（探索后确认已符合要求）：
- `components/workflows/Breadcrumbs.tsx` 早已在 `href && !isLast` 时渲染 `<Link>`，handoff 列的 P4 是 no-op
- `components/workflow/` / `components/chat/` / `stores/chatStore.ts` 三组 stub 文件在 Phase 2.6 之后已被物理删除，本次只需同步 README 措辞

#### 后端

| 文件 | 动作 |
|------|------|
| `routers/workflows.py` | **新建**：`GET /api/workflows` → `List[WorkflowSummary]`，调 `workflow_db.load_all_workflows()`，按 `created_at` 倒序 |
| `main.py` | 注册新 router：`app.include_router(workflows.router, prefix="/api")` |
| `tests/test_workflows_router.py` | **新建**：2 个 async test（空列表 + 多 workflow 倒序）；沿用 monkeypatch in-memory sqlite 的 pattern |

### 技术难点与应对

| 难点 | 方案 |
|------|------|
| Zustand 自引用触发 TS `any` 级联 | `loadWorkflow` 内原本写 `useWorkflowStore.getState()`，TS 判定 `useWorkflowStore` implicitly `any`，从而把 11 个消费点（`ContextPanel`, `BuildingAgentDetail` 等）全打成 `any`。改 `(set, get) => ...)` 形态 + 显式 `Promise<Workflow \| null>` 返回类型 |
| ESLint `react-hooks/set-state-in-effect` | 详情页不能在 effect body 同步 `setState('ready'/'loading')`。做法：从 store 派生 `isReady`；只保留 `notFoundId` 一个 state，且**仅在 `.then()` 异步 callback 里 `setNotFoundId(id)`** |
| REST 前缀冲突 | 已有 `/workflow`（单数）用于 item 路由，新集合路由若叫 `/workflow` 会冲突——新建**单独 router `/workflows`（复数）**解决，付出小量代码重复但不破坏现有前端调用 |
| Cowork 沙箱 `pytest` | 原 `backend/venv` 是 Windows-style（`Scripts/`），Linux 沙箱用不了。用 `pip install --break-system-packages pytest pytest-asyncio ...` 直装；PATH 加 `~/.local/bin` |

### 验证结果

| 命令 | 结果 |
|------|------|
| `cd frontend && npx tsc --noEmit` | ✅ exit 0 |
| `cd frontend && npx eslint . --quiet` | ✅ exit 0 |
| `cd backend && pytest -q` | ✅ **33 passed**（其中 2 个是本 Phase 新增：`test_list_workflows_empty` / `test_list_workflows_returns_summaries_newest_first`） |

### 本 Phase 延后到下一 Phase 的项

- **Step 6 / P3 节点实时状态 + mock 执行事件**：`workflowStore.updateNodeStatus` 已存在但没人发 socket 事件。真执行事件要等 Phase 6 的 Node Executor；若真要 mock，事件半径小，建议与 **Phase 4.5** 的结构化 tracing 一并做（都是"执行状态如何可观测"的一体化设计）

### 兼容性备注

- `readyWorkflowId` 的**清理时机**未显式处理——用户在同一 session 里完成工作流后若直接再开始新对话，`isBuildingComplete` / `readyWorkflowId` 仍为 true 直到 Clarifier 启动下一轮。CTA 显示条件是 `isBuildingComplete && readyWorkflowId`，在新一轮 `building:started` 触发前有极短的"陈旧状态"窗口期。未造成功能缺陷但是设计债，建议在 Phase 4.5 的 session checkpoint 工作里一并解决
- 所有改动对 Phase 3 端到端流程 **backward compatible**：老的 `chat_send → clarification:update → workflow:ready` 链路行为不变，只是右栏 view 切换机制从 `pendingPanelView` 迁到 `contextView`

---

## Phase 路线图升级说明（2026-04-23）

### 背景：Vision 升级

2026-04-23，用户明确了项目终极定位——**不是一个纯软件层的 AI workflow demo，而是一个面向真实桌面任务的 Agent Harness 平台**。用户典型 use case：

1. "每天 8 点自动帮我清原神日常" → 需要启动游戏、操作菜单、脚本化动作
2. "把这张图用 Tripo 转成 3D" → 需要打开浏览器、上传图片、等异步结果、下载文件
3. "调研 XXX 领域近 3 个月的进展" → 需要跨网站抓取文字 + 视频字幕 + 论文 PDF + 股市图表

这些任务的共性：**不是单轮 AI 调用能完成的，需要感知 + 工具 + 执行 + 验证 + 审批的完整闭环**。

### 决策：引入 Harness Engineering 六维度作为全局铁律

见 `project-overview.md` §4.5。六个维度（**上下文工程 / 工具编排 / 验证机制 / 状态管理 / 可观测性 / 人类接管**）不是某个 Phase 的任务，而是**所有 Phase 的设计约束**——任何 Phase 开工前要写一段"本 Phase 对六维度各贡献什么"。

### 决策：Phase 路线图按 Tier 重组

旧路线图（Phase 4/5/6/7 线性）装不下新 vision。新路线图分 **Tier A-E**，见 `project-overview.md` §1.1。关键调整：

- **新增 Phase 4.5 Agent Harness Foundation（Tier B）**：横切所有后续 Phase 的基础设施，包括结构化日志、执行追踪、checkpoint & resume、HITL approval 框架、context compaction
- **重写 Phase 5 为 Universal Web Perception（Tier C）**：Search + Fetch + 多模态预处理统一管线，覆盖视频 / 音频 / 3D / Office 文档
- **重写 Phase 6 为 Tool Registry + Node Executor（Tier C）**：多模型 tool-calling 适配 + Docker sandbox + 独立 evaluator agent（生成 / 评估分离）
- **新增 Phase 7 CUA MVP（Tier D）**：桌面感知（截图 + UIA + OCR）+ 基础动作（pywinauto + pyautogui）+ Planner-Executor + 安全层首版
- **新增 Phase 8 CUA 扩展（Tier D）**：软件生命周期、进程管理、完整 HITL approval
- **原 Phase 5 Sub-chat 后置为 Phase 10（Tier E）**
- **原 Phase 7 多 AI 扇出 + 打磨后置为 Phase 11（Tier E）**
- **游戏 AI 不单列 Phase**：Phase 7/8 的通用 CUA 已能支持"打开游戏 + 脚本化动作"，低延迟 game-playing AI 是用户高级用法，不特化

### 决策：关键技术选型

- **多模态兜底模型**：**Gemini 2.x**（视频 / 音频 / 长上下文全原生）；豆包作中文特别重的场景可选
- **Web Search Provider**：**Tavily**（主）+ **Brave**（低成本 fallback）+ **Exa**（语义）
- **3D 文件理解**：多视角渲染 → 图片 → VLM（主流 LLM 都不吃 `.obj/.gltf/.fbx`；Tripo/Meshy 是生成型不是理解型）
- **工具层架构**：**内部 service 为主**，必要时包 MCP wrapper；不做 MCP-first 因为核心调用方是项目内部的 node executor
- **Sandbox 粒度**：节点级 Docker（Phase 6），CUA 用独立 Windows VM / 进程（Phase 7）

---

## 下一个 Agent 的任务（分层 Tier A → E）

**按优先级从高到低。先读 `project-overview.md`（尤其是 §4.5 Harness 六维度），再读本章节，然后按 Phase 顺序推进。**

> **每个 Phase 开工前的仪式**：在 `phase-<N>-plan.md` 新建文件（或在本文件追加章节），写一段**"本 Phase 对 Harness 六维度各贡献什么"**。这是宪法级约束，不可跳过。

### Tier A — Phase 4 收尾（仅剩 Step 6，可与 Phase 4.5 合并）

估时：0.5 天。P0-P2 + P4-P5 已在 2026-04-24 归档完成，见上方「Phase 4」章节。**仅剩 P3（节点实时状态 + mock 执行事件）**——因为真正的执行事件来自 Phase 6 的 Node Executor，且 Phase 4.5 会统一做 tracing 体系，**建议延后到 Phase 4.5 一起做**，不单独开工。

#### P3（延后） — 节点实时状态

- `workflowStore.updateNodeStatus(nodeId, status)` 已存在，socket 层的 `execution:node_started / node_complete / node_error` listener 也在 `useSocket.ts` 里（见 Phase 3 代码）
- 缺的是：**服务端**尚未发这些事件。要么写一个 mock 触发器（Phase 4 tactical），要么直接等 Phase 6 的 Node Executor（战略正确做法）
- `TaskNodeCard` 的 `status` 字段已支持 `queued / running / complete`，无需改 UI
- **决策**：并入 Phase 4.5 D5 "接通 building:log + execution:trace" 一起处理

---

### Tier B — Phase 4.5（Agent Harness Foundation）**— 当前下一优先级**

估时：5-7 天。**所有后续 Phase 的地基**。Phase 4 收尾已集成进此 Phase 的 D5。

#### B1 — 结构化日志 + 执行追踪

- 引入 `structlog`（或 `loguru`），所有日志 JSON 结构化：`{ts, session_id, node_id, agent, event_type, payload}`
- 新增 `backend/services/observability/logger.py` 封装
- 新增 `backend/services/observability/tracer.py`：为每个 LLM 调用 / 工具调用生成 span，span_id 关联 trace
- 可选：OpenTelemetry + Jaeger，但先做结构化日志，Jaeger 后面加

#### B2 — Checkpoint & Resume

- 新增 DB 表 `agent_sessions`：`{session_id, state, task_list_json, trajectory_jsonb, created_at, updated_at, resumable}`
- `conversation_manager.py` 每次 state 迁移时同步到 DB
- 新增 API `POST /api/sessions/{id}/resume`：从 DB 恢复 state 并继续
- 前端 `orchestraStore` 初始化时若 localStorage 有 sessionId 先尝试 resume

#### B3 — HITL Approval 框架

- 新增 `backend/services/approval/gate.py`：所有工具调用前查询 capability scope + 风险等级，必要时挂起等审批
- 新增 Socket.io 事件 `execution:approval_required`（Server→Client）和 `execution:approve`（Client→Server）
- 前端：`context/BuildingAgentDetail.tsx` 的 Pending Approvals 卡片接 Socket 事件，点 Approve/Deny 后发事件
- 新增 DB 表 `approval_records`：审计所有审批决策

#### B4 — Context Compaction 基础

- 新增 `backend/services/context/compactor.py`：当 agent 的 context 接近 80% 阈值时自动压缩（保留 goal + 最近 N 条 observation + decision log，丢掉过时）
- Clarifier / Designer 已有的长对话场景先接入

#### B5 — Kill Switch

- Socket.io 事件 `execution:kill`（Client→Server），对应 session 的 agent task cancel
- 前端 TopBar 加一个红色紧急停止按钮（session 有进行中任务时显示）

---

### Tier C — Phase 5（Universal Web Perception）

估时：7-10 天。让 agent 有"眼睛"看懂任何网页 / 任何内容。

#### C1 — Search Provider 抽象

- 新增 `backend/services/tools/web_search.py`：接 Tavily（主）+ Brave（备）+ Exa（语义），统一接口 `search(query, provider?, num_results?) -> SearchResult[]`
- 按 query 特征路由：语义查询走 Exa，实时/新闻走 Tavily，预算敏感走 Brave

#### C2 — Fetch 两档

- 新增 `backend/services/tools/web_fetch.py`
  - 第 1 档：`httpx` + Trafilatura 解析正文（静态页够用）
  - 第 2 档：Playwright headless，完成 JS 渲染 → 截图 + DOM + 正文
  - Fallback：Jina Reader（`r.jina.ai/<url>`）兜底
- 自动判断要走哪档（content-type、JS 重度启发式）

#### C3 — 多模态预处理管线

- 新增 `backend/services/tools/multimodal_preprocess.py`：统一产出 `{text, images[], audio_transcript?, metadata}`
  - **视频**：`yt-dlp` 下载 → `ffmpeg` 抽关键帧 → Whisper 转录 → 合并为结构化产物
  - **音频**：Whisper 转录（本地 or OpenAI API）
  - **3D 文件**：`trimesh` + `pyrender` 从 6-8 视角渲染 → 图片组
  - **Office**：`mammoth`（docx）/ `python-pptx`（pptx）/ `openpyxl`（xlsx）→ 文本 + 截图
  - **图片**：直接原图（vision 模型吃）
  - **PDF**：直接 document input（Claude 原生支持）

#### C4 — 统一感知接口

- 新增 `backend/services/tools/perceive.py`：一个 `perceive(url_or_path) -> UnifiedPerception` 入口，内部路由到 C2 / C3
- `UnifiedPerception` schema：`{source_type, text, images[], audio_transcript?, structured_data?, metadata, errors[]}`
- 任何节点调这一个接口就能拿到一个"网页 / 文件"的**全部可感知信息**

#### C5 — Gemini 2.x 多模态 adapter

- 新增 `backend/services/llm/gemini_adapter.py`：统一封装 Gemini 2.x 多模态调用，兼容现有 `anthropic_adapter` 形态
- 视频 / 长音频任务默认路由到 Gemini，结构化 reasoning 还是 Claude

#### 验证

- 测试 set：10 个典型 URL（YouTube / 股市图表 / SPA / PDF / docx / 3D 文件链接 / 播客 mp3 / 3D 渲染 / 论文 / 新闻）
- 每个 URL 都要能产出非空 `UnifiedPerception`，对应字段有值

---

### Tier C — Phase 6（Tool Registry + Node Executor）

估时：7-10 天。让 agent 有"手"能用工具 + 有"检察官"做验证。

#### D1 — Tool Registry

- 新增 `backend/services/tools/registry.py`：集中注册所有工具（Phase 5 的 perceive / fetch，以及未来 Phase 7 的 CUA 工具）
- 每个工具声明：`{name, description, schema, risk_level, capability_required, implementation}`
- 多模型 schema 转换：Claude tools / OpenAI function / Gemini function calling 三种格式自动生成

#### D2 — Node Executor + Sandbox

- 新增 `backend/services/executor/node_executor.py`：按节点 config 调用对应模型 + 工具，在 Docker 容器里跑
- `backend/services/executor/sandbox.py`：Docker 容器模板，资源限制 + 网络白名单
- 每次执行落 `ExecutionTrace` 到 DB

#### D3 — Evaluator Agent（生成 / 评估分离）

- 新增 `backend/services/executor/evaluator.py`：独立 LLM 实例（通常用更强的模型，比如 Opus 评 Sonnet 的产出）
- 接节点输出 + 原 prompt + 评分标准 → 返回 `{score, issues[], suggestions[]}`
- 评估不通过 → re-plan 循环（最多 3 轮）

#### D4 — 确定性约束 hooks

- 代码生成节点输出后，自动跑 `ruff`（Python）/ `eslint`（TS）/ `mypy`（类型）
- 失败 → 反馈给生成 agent 修复循环

#### D5 — 接通 Phase 3 的 building:log

- 节点执行时实时发 `building:log`（已有 Socket 事件）
- `execution:trace` 后端→前端，前端可在 BuildingAgentDetail 看到完整 span

---

### Tier D — Phase 7（CUA MVP — 桌面感知 + 基础动作）

估时：10-14 天。让 agent 有"身体"。

#### E1 — 感知层

- `backend/services/cua/perception.py`：
  - `mss` 快速截图（全屏 / 指定窗口）
  - `uiautomation` 拿当前前台窗口的 UIA 树
  - PaddleOCR 或 Tesseract 对截图做 OCR
  - 统一产出 `DesktopObservation`：`{timestamp, screenshot_path, ui_tree, ocr_text, focused_window}`

#### E2 — 动作层

- `backend/services/cua/action.py`：
  - `pywinauto`：semantic actions（通过 UIA 找到按钮 / 菜单 / 输入框再调 invoke / set_text）
  - `pyautogui`：pixel fallback（当 UIA 找不到元素时）
  - 统一接口：`click_ui_element(role, name) / type_text(text) / press_hotkey(keys) / open_application(name) / focus_window(title)`

#### E3 — Planner-Executor Loop

- `backend/services/cua/planner.py`：经典 ReAct loop
  ```
  observation → thought → action → verify(new observation) → next thought ...
  ```
- Observation 用 Claude Sonnet / Gemini Flash 做快速理解
- 验证步骤：动作后重新 observe，对比预期（比如"点了保存按钮"预期窗口标题不再有"*"）

#### E4 — 首版安全层

- `backend/services/cua/safety.py`：
  - **Capability Scoping**：工作流声明它允许访问的目录 / 域名 / 应用列表，执行前检查
  - **Audit Log**：每个 action 带时间戳持久化到 DB（`cua_action_log` 表）
  - **Dangerous Action Gate**：删除文件 / 关闭窗口带未保存内容 / 启动未知程序 → 触发 Phase 4.5 的 approval gate

#### E5 — 沙箱约束

- **开发环境**：只在开发者本地 Windows 或 VM 里跑，**绝不在 CI 或生产服务器做桌面自动化**
- **推荐**：准备一个 Windows 11 VM（VirtualBox / VMware），所有 CUA 测试在里面

---

### Tier D — Phase 8（CUA 扩展 — 应用生命周期 + 跨应用流程）

估时：10-14 天。

#### F1 — 应用生命周期

- `backend/services/cua/lifecycle.py`：
  - `install_application(installer_path)`：静默安装（winget / msi 参数 / InnoSetup / NSIS 常见 switches）
  - `uninstall_application(name)`：通过 `wmic product` 或注册表 uninstall string
  - `start_service(name)` / `kill_process(pid_or_name)`
- 所有 dangerous 操作走 approval gate

#### F2 — 跨应用流程

- Browser + Desktop 协同 case：
  - 在浏览器 Tripo 网站上传图片（Playwright）
  - 等待结果下载到本地（文件系统监听）
  - 用 Blender 桌面应用打开 3D 文件（`open_application` + `click_ui_element`）
- 验证：完整跑通 "图片 → Tripo → 3D 文件 → Blender 打开" 的端到端用例

#### F3 — Replay & Kill Switch 完整版

- `cua_action_log` 可按 session 导出 trajectory，重放到同一 VM 状态下
- Kill Switch 对 CUA：任何进行中的鼠标键盘序列能立即中断 + 回到安全状态

#### F4 — HITL Approval 完整接入

- 所有 `dangerous` 级别 action 强制走 approval
- 前端 Approval Window 支持富预览（截图 + 要执行的 action 描述 + 可能的影响）

---

### Tier E — Phase 10（Sub-chat 分叉 + File Repository）

估时：5-7 天。

- `components/orchestra/context/ClarificationDetail.tsx` / `BuildingAgentDetail.tsx` 接入 sub-chat
- 每个节点可展开嵌套对话，与该节点的 agent 单独聊
- File Repository：收集工作流产出的文件，按 session 分组展示

---

### Tier E — Phase 11（多 AI 扇出 + 双语 + 市场真实化）

估时：7-10 天。

- GPT / Gemini / DeepSeek 扇出到 Arena 页面（同一 prompt 多模型对比）
- 全站中英双语（next-intl）
- Marketplace / Arena / Team 页面接真实数据

---

## 交接说明（给继任 Agent 的开工清单）

1. **读 `project-overview.md`**——速览 + Phase 路线图 + **§4.5 Harness 六维度铁律（必读）** + 文件索引
2. **读本文件的「下一个 Agent 的任务」章节**——按 Tier A→E 顺序挑你的 Phase
3. **确认当前 phase 状态**——本文件顶部索引 + `project-overview.md` 的 Phase 状态表（二者应一致；若不一致以本文件为准并同步回 overview）
4. **执行任务前跑一次验证基线**：
   ```bash
   cd frontend && npx tsc --noEmit && npx eslint . --quiet
   cd backend && pytest
   ```
   记下基线结果，避免把预存错误算到本次改动头上。
5. **Phase 开工仪式**：在本文件末尾追加一节「Phase N 启动说明」，写一段"本 Phase 对 Harness 六维度各贡献什么"。这是宪法级约束，不可跳过。
6. **完成后更新三件事**：
   - 本文件：给完成的 Phase 加归档章节（参考 Phase 2.5 / 3 / 2.6 的格式）
   - `project-overview.md`：Phase 状态表从 🔲 改 ✅
   - `README.md`（英文）：`Features` 表对应行状态同步
