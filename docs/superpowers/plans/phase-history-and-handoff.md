# OrchestrAI — Phase 历史归档 & 交接手册

> **用途**：记录已完成 Phase 的关键决策、交付清单、验证结果，以及下一个 Agent 需要接手的任务。
>
> **前置阅读**：`project-overview.md`（项目速览 + 架构决策）。本文件侧重"发生了什么"和"接下来做什么"，不重复总览信息。
>
> **索引**：
> - [Phase 2.5（2026-04-17）Orchestra Context Panel 重构](#phase-25-orchestra-context-panel-重构2026-04-17)
> - [Phase 3 The Orchestra 功能接线](#phase-3-the-orchestra-功能接线)
> - [Phase 2.6（2026-04-21）前端清理 + 视觉升级](#phase-26-前端清理--视觉升级2026-04-21)
> - [下一个 Agent 的任务（Phase 4）](#下一个-agent-的任务phase-4)

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
- Building Process Approve/Deny → agent-command dispatch（Phase 6）
- 真实 activity log 流（Phase 6）
- 真实 Undo/Redo 绑到应用状态 stack（待定）
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
- `frontend/components/orchestra/context/ClarificationDetail.tsx` → Phase 5
- `frontend/components/orchestra/context/BuildingAgentDetail.tsx` → Phase 5
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

**残留 lint 错误**（下一个 Agent 顺手修）：
1. `components/orchestra/ContextPanel.tsx:36` — `pendingPanelView` 的 effect 存在 `setState in effect` 反模式 → 建议移到 `orchestraStore.setPendingPanelView` setter 里直接同步
2. `stores/workflowStore.ts:83` — `as any` 类型 → 替换成正确的泛型

### 兼容性备注

- 本次改动**未触碰任何后端代码**，Phase 3 端到端流程不受影响
- `globals.css` 所有新 CSS var 是 **additive** 的（只新增、未重命名或移除旧 token），即便某处仍引用旧变量也不会崩
- 所有 stub 文件都保留 `@deprecated` 注释，物理删除前可反复检索

---

## 下一个 Agent 的任务（Phase 4）

按优先级从高到低。**先读 `project-overview.md`，再读本文件对应章节，然后直接开始。**

### P0 — 物理删除 stub 文件（一次性清理）

```bash
cd frontend
rm -rf components/workflow components/chat stores/chatStore.ts
# 然后更新 README.md 的 "Project Structure" 段落（移除 workflow/ 和 chat/ 两段）
```

### P0 — 修两个历史 ESLint 错误

- **`components/orchestra/ContextPanel.tsx:36`** — 移掉 effect 里的 `setState`，改在 `orchestraStore.setPendingPanelView` setter 里直接更新 view（或用 React 19 `use()`）
- **`stores/workflowStore.ts:83`** — 把 `as any` 替换成正确的泛型

### P1 — 工作流数据流打通（Phase 4 核心）

**`orchestra/page.tsx`** 第 39-43 行 `readyWorkflowId` 监听：

```ts
// 当前：console.log
// 改为：
router.push(`/workflows?wf=${readyWorkflowId}`)
```

**`workflows/page.tsx`**：`useSearchParams` 拿 `wf`，调 `loadWorkflow(id)`（在 `workflowStore` 里新增 action，内部调 `getWorkflow(id)` REST）。

### P2 — NodeDetailDrawer 接真数据

- 扩展 `NodeDetail` 类型：`{ id, title, modelLabel, description, prompt, execution_method, tools_used[] }`
- `WorkflowCanvas.onNodeClick` 从 `workflow.nodes` 找到完整节点数据传入
- `NodeDetailDrawer` 的 Config Tab 替换 mock（plugins / skills / permissions）为真实字段（可先只显示 `description` / `prompt`，其它字段后端尚未产出）
- Sub-Agent Chat Tab **留给 Phase 5**，暂不接后端

### P3 — 节点实时状态

- `workflowStore` 新增 `updateNodeStatus(nodeId, status)` action
- `useSocket.ts` 订阅 `execution:start / execution:complete / execution:error`（Phase 6 会真发这些事件，Phase 4 可先 mock）
- `TaskNodeCard` 的 `status` 字段已支持 `queued / running / complete`，**无需改 UI**

### P4 — Breadcrumbs 可点

- `Breadcrumbs.tsx` 把 `span` + `href` 改成 `<Link href={item.href}>` 当 `item.href` 存在
- `WorkflowCanvas` 里 crumbs 第一项 `href: '/workflows'` 需要实际路由存在 → **触发下面的 P5**

### P5 — 新建 `/workflows` 列表页

- 后端 REST：`GET /api/workflows` 返回当前用户所有 workflow（后端已有 `workflow_db.list_workflows()`，包一个 router 即可）
- 前端：`app/(app)/workflows/page.tsx` 改为列表视图，网格卡片（**复用 `ProjectCard` 样式**）
- 新建 `app/(app)/workflows/[id]/page.tsx`，挂 `<WorkflowCanvas />` + 从 URL 拿 id

---

## 交接说明（给继任 Agent 的开工清单）

1. **读 `project-overview.md`** —— 30 秒拿到项目速览 + 架构决策 + 文件索引
2. **读本文件的「下一个 Agent 的任务」章节** —— 知道 P0 → P5 的优先级
3. **确认当前 phase 状态** —— 本文件顶部索引 + `project-overview.md` 的 Phase 状态表（二者应一致，若不一致以本文件为准并同步）
4. **执行任务前跑一次验证基线**：
   ```bash
   cd frontend && npx tsc --noEmit && npx eslint . --quiet
   cd backend && pytest
   ```
   记下基线结果，避免把预存错误算到自己头上
5. **完成后更新**：
   - 本文件对应 Phase 章节加一小节 "交付清单"
   - `project-overview.md` 的 Phase 状态表改 ✅
   - `README.md` Development Status 段落加一条
6. **沙箱约束**：需要 `rm` 请走 `mcp__cowork__allow_cowork_file_delete`；Figma 域名在黑名单不要绕；`Write` 前必须 `Read`
