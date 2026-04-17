# Phase 3 Plan — The Orchestra 功能接线

## Context

当前 Orchestra 页面全部为静态占位数据，后端 `chat_send` 事件收到消息后直接调用 `generate_workflow_and_respond()` 无任何意图判断、澄清或确认流程。Phase 3 的目标是将整个系统接通：用户在 ChatThread 输入自然语言 → Orchestrator 判断意图 → Clarifier 多轮澄清 → 用户确认计划 → Workflow Designer 生成工作流结构 → Workflows 页面可见。节点实际执行能力（Phase 6）不在此范围。

**交付成果**：用户输入"帮我创建一个建模工作流" → 经过澄清确认流程 → Workflows 页出现真实工作流，各节点有标题/描述/推荐 AI 模型。

---

## 架构总览

```
用户输入
  ↓ chat_send (Socket.io)
  ↓
[ConversationManager] 查当前 session 状态
  ├── idle → OrchestratorAgent 判断
  │     ├── casual_chat → Claude 直接回复，emit chat:message
  │     └── development_request → 转 ClarifierAgent，state → clarifying
  ├── clarifying → ClarifierAgent 处理用户回答
  │     ├── 还需要澄清 → 继续提问，emit clarification:update
  │     └── 信息足够 → 呈现 plan，state → awaiting_confirm，emit clarification:plan_ready
  └── awaiting_confirm → 等待 chat_confirm_start 事件（用户点确认按钮）
        ↓ chat_confirm_start
        ↓ state → generating
        ↓ WorkflowDesignerAgent 运行
        ↓ emit building:started → building:log (多条) → building:complete
        ↓ 保存 DB，emit workflow:ready {workflow_id}
        ↓ state → complete
```

---

## 会话状态机

### ConversationState（in-memory，per session_id）

```python
@dataclass
class ConversationState:
    state: Literal["idle", "clarifying", "awaiting_confirm", "generating", "complete"]
    history: list[dict]          # [{role: "user"|"assistant", content: str}] 传给 LLM 的上下文
    clarifications: list[dict]   # [{id, question, answer, status: "pending"|"answered"}]
    plan_summary: str | None     # ClarifierAgent 生成的计划摘要
    plan_nodes_preview: list     # 工作流节点预览 [{title, description, recommended_ai}]
    original_request: str        # 用户最初的开发需求
    history_log: list[dict]      # 用于右栏 History tab [{timestamp, action, detail}]
```

全局 dict: `conversation_states: dict[str, ConversationState] = {}`（key = session_id）

---

## 后端实现

### 新文件 1：`backend/services/conversation_manager.py`

管理 session 状态的工具函数。

```python
def get_state(session_id: str) -> ConversationState
    # 不存在则创建默认 idle 状态

def reset_state(session_id: str) -> None
    # 重置为 idle（用户新建项目时调用）

def append_history(session_id: str, role: str, content: str) -> None
    # 追加一条到 history

def add_clarification(session_id: str, clar_id: str, question: str) -> None
    # 新增一个待回答问题

def answer_clarification(session_id: str, clar_id: str, answer: str) -> None
    # 标记问题已回答，记录答案

def set_plan(session_id: str, summary: str, nodes_preview: list) -> None
    # 保存 plan，state → awaiting_confirm

def add_history_log(session_id: str, action: str, detail: str) -> None
    # 追加 history 条目（时间线用）
```

---

### 新文件 2：`backend/services/orchestrator_agent.py`

**职责**：判断用户消息是闲聊还是开发需求。轻量、低延迟。
**模型**：`claude-haiku-4-5-20251001`

```python
ORCHESTRATOR_SYSTEM = """
You are a routing agent for an AI workflow platform.
Classify the user's message as one of:
- "casual_chat": general conversation, questions, greetings, or anything NOT requesting to build/create/automate something
- "development_request": user wants to build software, create a workflow, automate a task, or develop something

Respond ONLY with valid JSON: {"route": "casual_chat" | "development_request", "brief_reason": "..."}
"""

async def route_message(user_message: str, history: list[dict]) -> dict:
    # 调用 claude-haiku-4-5-20251001（低延迟路由）
    # history 只取最近 6 条，保持低延迟
    # 返回 {"route": "casual_chat"|"development_request", "brief_reason": str}
    # 解析失败默认 casual_chat
```

---

### 新文件 3：`backend/services/clarifier_agent.py`

**职责**：多轮澄清，直到信息充分后呈现计划让用户确认。
**模型**：`claude-sonnet-4-6`

```python
CLARIFIER_SYSTEM = """
You are a clarification agent for an AI workflow platform. Your goal is to understand the user's development needs before designing a workflow.

Rules:
1. Ask 2-4 targeted questions per round (never more than 4)
2. When you have sufficient information, present a concise plan and ask for confirmation
3. Questions should be specific and actionable, not vague
4. Always respond with a friendly chat message AND structured data

Respond with JSON:
{
  "action": "ask" | "present_plan",
  "chat_message": "...",         // shown in ChatThread
  "questions": [                 // only when action == "ask"
    {"id": "q1", "question": "...", "hint": "e.g. ..."}
  ],
  "plan": {                      // only when action == "present_plan"
    "title": "...",
    "summary": "...",            // 2-3 sentences
    "nodes": [
      {"order": 1, "title": "...", "description": "...", "recommended_ai": "claude|gpt|gemini|deepseek"}
    ],
    "confirmation_prompt": "计划如上，是否开始生成工作流？"
  }
}
"""

async def clarify(
    session_id: str,
    user_message: str,
    state: ConversationState,
    sio_emit_fn: Callable
) -> None:
    # 1. 构造 messages：history + 当前消息
    # 2. 调用 claude-sonnet-4-6 流式响应
    # 3. 流式 token → emit chat:stream_token（用户看到 AI 在打字）
    # 4. 完整接收后解析 JSON（不实时解析，避免流式 JSON 残缺问题）
    # 5a. action == "ask":
    #     - 更新 conversation_manager 的 clarifications
    #     - emit clarification:update {questions: [...]}
    #     - state 保持 clarifying
    # 5b. action == "present_plan":
    #     - call set_plan(session_id, summary, nodes)
    #     - emit clarification:plan_ready {plan}
    #     - state → awaiting_confirm
    # 6. append chat message to history
```

---

### 新文件 4：`backend/services/workflow_designer.py`

**职责**：用户确认后，根据完整需求（原始请求 + 所有澄清 Q&A + 计划）生成完整工作流 JSON。
**模型**：`claude-sonnet-4-6`

```python
WORKFLOW_DESIGNER_SYSTEM = """
You are a workflow designer. Given a confirmed user request and clarification answers,
generate a detailed multi-step workflow.

Output a complete workflow JSON wrapped in <workflow_json>...</workflow_json> tags:
{
  "workflow_id": "wf_<uuid8>",
  "title": "...",
  "title_zh": "...",
  "description": "...",
  "nodes": [
    {
      "node_id": "node_<uuid8>",
      "order": 1,
      "title": "...",
      "title_zh": "...",
      "description": "...",
      "description_zh": "...",
      "assigned_ai": "claude|gpt|gemini",
      "tool_type": "llm|api|web_automation|code",
      "input_schema": {},
      "output_schema": {}
    }
  ]
}

Generate 3-7 nodes. Each node must be actionable and specific.
"""

async def design_workflow(
    session_id: str,
    state: ConversationState,
    sio_emit_fn: Callable
) -> Workflow | None:
    # 1. emit building:started
    # 2. 构造 context：original_request + 所有 Q&A + plan_summary
    # 3. emit building:log {type: "thinking", message: "正在分析需求..."}
    # 4. 调用 claude-sonnet-4-6
    # 5. 流式 token 过程中：
    #    - 每 ~500ms emit building:log {type: "generating", message: "正在设计节点..."}
    #    - 同时 emit chat:stream_token 让 ChatThread 也看到进度
    # 6. 解析 <workflow_json> 块
    # 7. emit building:log {type: "done", message: "工作流设计完成，共 N 个节点"}
    # 8. emit building:complete
    # 9. 返回 Workflow 对象（由调用方保存 DB 并 emit workflow:ready）
```

**Building Log 数据结构**（预留 Phase 5 点击展开）：

```python
class BuildingLog(BaseModel):
    log_id: str           # uuid
    timestamp: str        # ISO
    type: Literal["thinking", "analyzing", "generating", "deciding", "done", "error"]
    message: str          # 简短显示文字（≤ 50 chars）
    detail: str = ""      # 详细内容，Phase 5 点击展开时使用
    agent: str = "Workflow Designer"
```

---

### 修改文件：`backend/main.py`

完全重写 `chat_send` 事件逻辑，新增 `chat_confirm_start` 事件，删除旧的 `generate_workflow_and_respond` 直接调用。

```python
@sio.event
async def chat_send(sid, data):
    content = data.get("content", "").strip()
    session_id = data.get("session_id", "default")
    if not content:
        return

    await _emit_user_message(content, session_id)
    state = get_state(session_id)
    append_history(session_id, "user", content)
    add_history_log(session_id, "用户消息", content[:80])

    if state.state == "idle":
        route_result = await route_message(content, state.history[-6:])
        if route_result["route"] == "casual_chat":
            await _stream_casual_reply(content, state.history, session_id)
        else:
            state.state = "clarifying"
            state.original_request = content
            await clarify(session_id, content, state, sio.emit)

    elif state.state == "clarifying":
        await clarify(session_id, content, state, sio.emit)

    elif state.state == "awaiting_confirm":
        # 用户在确认阶段追加需求 → 回退到 clarifying
        state.state = "clarifying"
        await clarify(session_id, content, state, sio.emit)

    elif state.state in ("generating", "complete"):
        # 生成中或完成后的闲聊 → 直接回复（Phase 5 做 sub-chat）
        await _stream_casual_reply(content, state.history[-10:], session_id)


@sio.event
async def chat_confirm_start(sid, data):
    """用户在 Clarifications tab 点击"开始生成"时触发"""
    session_id = data.get("session_id", "default")
    state = get_state(session_id)
    if state.state != "awaiting_confirm":
        return

    state.state = "generating"
    add_history_log(session_id, "用户确认", "开始生成工作流")

    workflow = await design_workflow(session_id, state, sio.emit)
    if workflow:
        await save_workflow(workflow, session_id)
        state.state = "complete"
        add_history_log(session_id, "工作流生成", f"{workflow.title}（{len(workflow.nodes)} 个节点）")
        await sio.emit(
            "workflow:ready",
            {"workflow_id": workflow.workflow_id, "title": workflow.title, "node_count": len(workflow.nodes)},
            room=session_id,
        )
```

辅助函数 `_stream_casual_reply`：

```python
async def _stream_casual_reply(user_msg: str, history: list, session_id: str):
    msg_id = f"msg_{uuid.uuid4().hex[:8]}"
    await sio.emit("chat:stream_start", {"message_id": msg_id, "sender": "claude"}, room=session_id)
    full = ""
    async with anthropic_client.messages.stream(...) as stream:
        async for token in stream.text_stream:
            full += token
            await sio.emit("chat:stream_token", {"message_id": msg_id, "token": token}, room=session_id)
    await sio.emit("chat:stream_end", {"message_id": msg_id, "content": full}, room=session_id)
    append_history(session_id, "assistant", full)
```

---

### 新增 Socket.io 事件清单（完整）

| 方向 | 事件名 | Payload | 触发时机 |
|------|--------|---------|---------|
| F→B | `chat_send` | `{content, session_id}` | 用户发消息 |
| F→B | `chat_confirm_start` | `{session_id}` | 用户点击"开始生成" |
| F→B | `join_session` | `{session_id}` | 页面加载时（已有） |
| B→F | `chat:stream_start` | `{message_id, sender}` | AI 开始输出 |
| B→F | `chat:stream_token` | `{message_id, token}` | 每个 token |
| B→F | `chat:stream_end` | `{message_id, content}` | AI 输出完毕 |
| B→F | `chat:message` | ChatMessage | 完整消息（non-streaming） |
| B→F | `clarification:update` | `{questions: [{id, question, hint}]}` | Clarifier 提出问题 |
| B→F | `clarification:plan_ready` | `{plan: {title, summary, nodes, confirmation_prompt}}` | Clarifier 呈现计划 |
| B→F | `building:started` | `{session_id}` | Workflow Designer 启动 |
| B→F | `building:log` | BuildingLog | 每条日志 |
| B→F | `building:complete` | `{node_count}` | 设计完成 |
| B→F | `workflow:ready` | `{workflow_id, title, node_count}` | 工作流已存 DB |
| B→F | `history:update` | `{entries: HistoryEntry[]}` | 任何 history 变更 |

---

### 修改文件：`backend/models/chat.py`

新增 MessageType 枚举值：

```python
class MessageType(str, Enum):
    text = "text"
    workflow_generated = "workflow_generated"
    node_update = "node_update"
    system = "system"
    clarification = "clarification"   # 新增
    plan_ready = "plan_ready"         # 新增
    building = "building"             # 新增
```

新增 Pydantic 模型：

```python
class ClarificationQuestion(BaseModel):
    id: str
    question: str
    hint: str = ""
    answer: str = ""
    status: Literal["pending", "answered"] = "pending"

class PlanNode(BaseModel):
    order: int
    title: str
    description: str
    recommended_ai: str = "claude"

class PlanPayload(BaseModel):
    title: str
    summary: str
    nodes: list[PlanNode]
    confirmation_prompt: str

class BuildingLog(BaseModel):
    log_id: str
    timestamp: str
    type: Literal["thinking", "analyzing", "generating", "deciding", "done", "error"]
    message: str
    detail: str = ""
    agent: str = "Workflow Designer"

class HistoryEntry(BaseModel):
    entry_id: str
    timestamp: str
    action: str
    detail: str = ""
```

---

## 前端实现

### 新文件：`frontend/stores/orchestraStore.ts`

```typescript
type ConvState = 'idle' | 'clarifying' | 'awaiting_confirm' | 'generating' | 'complete'

interface OrchestraStore {
  sessionId: string
  convState: ConvState
  pendingPanelView: string | null   // 驱动右栏自动切换

  // ChatThread
  messages: ChatMessage[]
  streamingBuffers: Record<string, string>  // message_id → accumulated text

  // Clarifications tab
  clarificationQuestions: ClarificationQuestion[]
  plan: Plan | null

  // Building Process tab
  buildingLogs: BuildingLog[]
  isBuildingComplete: boolean

  // History tab
  historyEntries: HistoryEntry[]

  // Cross-page
  readyWorkflowId: string | null

  // Actions
  setSessionId: (id: string) => void
  setConvState: (s: ConvState) => void
  setPendingPanelView: (view: string | null) => void
  addMessage: (msg: ChatMessage) => void
  appendStreamToken: (messageId: string, token: string) => void
  finalizeStream: (messageId: string, content: string) => void
  setClarifications: (questions: ClarificationQuestion[]) => void
  setPlan: (plan: Plan) => void
  addBuildingLog: (log: BuildingLog) => void
  setBuildingComplete: () => void
  addHistoryEntry: (entry: HistoryEntry) => void
  setReadyWorkflowId: (id: string) => void
  reset: () => void
}
```

---

### 修改文件：`frontend/hooks/useSocket.ts`

新增事件监听：

```typescript
socket.on('chat:stream_start', ({ message_id, sender }) => {
  store.addMessage({ message_id, sender, content: '', is_streaming: true })
})
socket.on('chat:stream_token', ({ message_id, token }) => {
  store.appendStreamToken(message_id, token)
})
socket.on('chat:stream_end', ({ message_id, content }) => {
  store.finalizeStream(message_id, content)
})
socket.on('clarification:update', ({ questions }) => {
  store.setClarifications(questions)
  store.setConvState('clarifying')
  store.setPendingPanelView('clarifications')  // 触发右栏自动切换
})
socket.on('clarification:plan_ready', ({ plan }) => {
  store.setPlan(plan)
  store.setConvState('awaiting_confirm')
  // 右栏保持在 clarifications，显示视图 B（计划确认）
})
socket.on('building:started', () => {
  store.setConvState('generating')
  store.setPendingPanelView('building')
})
socket.on('building:log', (log) => { store.addBuildingLog(log) })
socket.on('building:complete', () => { store.setBuildingComplete() })
socket.on('workflow:ready', ({ workflow_id, title, node_count }) => {
  store.setReadyWorkflowId(workflow_id)
  store.setConvState('complete')
  // Toast: "{title} 已生成 ({node_count} 个节点)，点击查看 →"
})
socket.on('history:update', ({ entries }) => {
  entries.forEach(e => store.addHistoryEntry(e))
})
```

---

### 修改文件：`frontend/app/(app)/orchestra/page.tsx`

```typescript
// 1. sessionId 初始化
const sessionId = useMemo(() => {
  const stored = localStorage.getItem('orchestrai_session')
  if (stored) return stored
  const id = `session_${crypto.randomUUID().slice(0, 8)}`
  localStorage.setItem('orchestrai_session', id)
  return id
}, [])

// 2. 加入 session
useEffect(() => {
  socket.emit('join_session', { session_id: sessionId })
  store.setSessionId(sessionId)
}, [sessionId])

// 3. 监听 pendingPanelView，驱动右栏切换
const pendingPanelView = useOrchestraStore(s => s.pendingPanelView)
useEffect(() => {
  if (!pendingPanelView) return
  goTo(pendingPanelView)  // ContextPanel 的导航函数
  store.setPendingPanelView(null)
}, [pendingPanelView])
```

---

### 修改文件：`frontend/components/orchestra/ChatThread.tsx`

- `messages` 来自 `orchestraStore.messages`（替换 hardcode）
- 流式消息：`is_streaming: true` 时追加 streamingBuffers[id] 到显示内容，显示打字光标
- 发送：`socket.emit('chat_send', { content, session_id })`
- 输入框禁用条件：`convState === 'generating'`
- 自动滚底：`useEffect` 监听 `messages.length`

---

### 修改文件：`frontend/components/orchestra/context/ClarificationsList.tsx`

分两种视图，由 `convState` 决定：

**视图 A — 澄清阶段**（`convState === 'clarifying'`）：
- 问题列表，每条显示 status badge（待回答 / 已回答）
- 底部提示："请在对话框中回答上方问题"

**视图 B — 确认阶段**（`convState === 'awaiting_confirm'`）：
- `plan.summary` 文字摘要
- `plan.nodes` 预览列表（序号 + 标题 + 推荐 AI 角标）
- 底部：`plan.confirmation_prompt` + 「开始生成」按钮
- 按钮 onClick → `socket.emit('chat_confirm_start', { session_id })`
- 点击后按钮变 loading（convState 会迅速切换到 generating）

---

### 修改文件：`frontend/components/orchestra/context/BuildingProcessList.tsx`

- 粗粒度进度条（log 数 / 预期总数估算百分比）
- 日志列表：图标（思考/生成/完成）+ message + 时间戳
- `isBuildingComplete` 时进度条变绿，显示"设计完成"
- `detail` 字段预留，Phase 5 前点击 no-op（不报错）

---

### 修改文件：`frontend/components/orchestra/context/OverviewList.tsx`

4 个卡片 badge 动态来自 store：
- Clarifications：`clarificationQuestions.length`
- Building Process：`buildingLogs.length`（generating 时显示 Live 指示器）
- History：`historyEntries.length`
- Agent Reports：0（Phase 7）

---

### 修改文件：`frontend/components/orchestra/context/HistoryTimeline.tsx`

- 从 `orchestraStore.historyEntries` 读取，替换静态数据
- 每条：时间戳 + action 标题 + detail
- Undo/Redo 按钮保留 UI，Phase 3 暂时 disabled

---

## 数据流完整走一遍

```
1. 用户输入"帮我创建建模工作流"
   → socket.emit('chat_send', {content, session_id})

2. 后端 chat_send:
   → echo 用户消息 → B→F chat:message
   → state==idle → route_message() → "development_request"
   → state→clarifying，clarify() 启动

3. ClarifierAgent 流式输出:
   → B→F chat:stream_start/token/end（ChatThread 显示打字动画）
   → 解析 JSON: action="ask", questions=[...]
   → B→F clarification:update → 右栏自动切到 Clarifications，显示问题列表

4. 用户回答问题后，再次 chat_send:
   → ClarifierAgent 判断信息足够 → action="present_plan"
   → B→F clarification:plan_ready → 右栏显示计划 + "开始生成"按钮

5. 用户点"开始生成":
   → F→B chat_confirm_start
   → state→generating
   → B→F building:started → 右栏切换到 Building Process
   → design_workflow() 运行

6. WorkflowDesignerAgent:
   → B→F building:log × 多条（thinking/analyzing/generating/done）
   → B→F building:complete

7. 保存 DB:
   → B→F workflow:ready {workflow_id}
   → 前端 Toast："建模工作流已生成 (5 个节点)，点击查看 →"
   → 点击导航到 /workflows，工作流节点可见
```

---

## 文件变更清单

### 新增（后端）
| 文件 | 说明 |
|------|------|
| `backend/services/conversation_manager.py` | ConversationState 数据类 + CRUD |
| `backend/services/orchestrator_agent.py` | Haiku 路由判断 |
| `backend/services/clarifier_agent.py` | Sonnet 多轮澄清 + plan 呈现 |
| `backend/services/workflow_designer.py` | Sonnet 工作流 JSON 生成 |

### 新增（前端）
| 文件 | 说明 |
|------|------|
| `frontend/stores/orchestraStore.ts` | Orchestra 专用 Zustand store |

### 修改（后端）
| 文件 | 变更 |
|------|------|
| `backend/main.py` | 重写 chat_send，新增 chat_confirm_start，新增 _stream_casual_reply |
| `backend/models/chat.py` | 新增 MessageType 值 + 4 个 Pydantic 模型 |

### 修改（前端）
| 文件 | 变更 |
|------|------|
| `frontend/hooks/useSocket.ts` | 新增 8 个事件监听 + confirmStart 方法 |
| `frontend/app/(app)/orchestra/page.tsx` | sessionId 初始化，join_session，pendingPanelView 监听 |
| `frontend/components/orchestra/ChatThread.tsx` | 接真实 store，流式渲染，禁用态 |
| `frontend/components/orchestra/context/ClarificationsList.tsx` | 双视图（澄清/确认），"开始生成"按钮 |
| `frontend/components/orchestra/context/BuildingProcessList.tsx` | 真实日志，进度条 |
| `frontend/components/orchestra/context/OverviewList.tsx` | 动态 badge |
| `frontend/components/orchestra/context/HistoryTimeline.tsx` | 真实 historyEntries |

### 本 Phase 不动
- `backend/services/executor.py` → Phase 6
- `backend/routers/execution.py` → Phase 6
- `frontend/components/orchestra/context/ClarificationDetail.tsx` → Phase 5
- `frontend/components/orchestra/context/BuildingAgentDetail.tsx` → Phase 5
- `frontend/components/workflows/` → Phase 4（workflow:ready 触发导航即可）

---

## 技术难点与应对

| 难点 | 问题 | 方案 |
|------|------|------|
| 流式 + 结构化数据同步 | 流式 token 驱动 ChatThread，完成后再驱动右栏 | 后端先完整接收 stream 再解析 JSON，tokens 只用于"打字感"显示 |
| JSON 解析健壮性 | LLM 偶发输出不完整 JSON | 正则提取 `{...}` 块，失败 fallback 到 `{action:"ask", questions:[{id:"fallback",...}]}`，永不崩溃 |
| 右栏自动切换解耦 | useSocket 在 hook 里无法直接调用 ContextPanel goTo | orchestraStore.pendingPanelView + page.tsx useEffect 监听，清空后驱动 |
| 用户在确认阶段发新消息 | 计划已呈现，用户想改需求 | state 回退到 clarifying，Clarifier 重新评估，可能继续追问或 re-present_plan |
| workflow_id 跨页面共享 | Workflows 页需要知道刚生成的工作流 | orchestraStore.readyWorkflowId 全局存储；路由时附带 `?wf=id` 作为 fallback |

---

## 验证方案

```bash
# 启动
docker compose up --build
# 访问 http://localhost:3000/orchestra
```

| 测试路径 | 预期结果 |
|---------|---------|
| 输入"你好" | ChatThread 流式回复，右栏不变，state 保持 idle |
| 输入"帮我创建建模工作流" | 右栏切到 Clarifications，出现 2-4 个问题 |
| 回答问题后 | Clarifier 呈现计划，右栏显示"开始生成"按钮 |
| 点"开始生成" | 右栏切到 Building Process，日志条目出现 |
| 生成完成 | Toast 提示，/workflows 可见工作流节点 |
| 确认阶段发"改一下" | state 回退 clarifying，重新澄清 |
| History tab | 完整时间线（用户消息/确认/生成等条目） |

```bash
# API 验证
curl http://localhost:8000/api/health
curl http://localhost:8000/api/workflow/<workflow_id>

# 日志验证
docker compose logs -f backend
# 应出现: [orchestrator] route: development_request
#         [clarifier] action: ask / present_plan
#         [designer] workflow saved: wf_xxxxxxxx
```
