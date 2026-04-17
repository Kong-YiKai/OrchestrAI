# OrchestrAI — 项目总 Phase 规划

## 产品定位

AI 工作流编排平台 Demo。用户用自然语言描述想法，AI 实时生成可视化多步骤工作流，每步可选不同 AI 模型执行。

---

## Phase 完成状态

| Phase | 名称 | 状态 | 核心交付 |
|-------|------|------|---------|
| 1 | 核心脚手架 + 分屏布局 | ✅ 完成 | Next.js + FastAPI + Socket.io + Zustand + React Flow |
| 1.5 | Docker Compose + 数据库基础设施 | ✅ 完成 | PostgreSQL + SQLAlchemy async + Docker 一键启动 |
| 2 | 设计系统 + App Shell + 三路由骨架 | ✅ 完成 | 暖色主题 + AppSidebar/TopBar + Dashboard/Orchestra/Workflows |
| 2.5 | Orchestra 右栏 Project Context 重构 | ✅ 完成 | 4 竖排 drill-in 卡片 + View union 导航 + 两级下钻 |
| **3** | **The Orchestra 功能接线** | 🔲 规划中 | Chat→Clarify→Confirm→生成工作流，3 Agent 架构 |
| 4 | Workflows 画布功能接线 | 🔲 待规划 | 节点持久化、NodeDetailDrawer 真实数据、Breadcrumbs |
| 5 | 嵌套 Sub-chat 分叉 + File Repository | 🔲 待规划 | 节点内 Sub-chat、Building Log 点击展开 |
| 6 | 节点执行引擎 | 🔲 待规划 | API 直连 → Playwright → Claude 模拟三层降级，Approval Window |
| 7 | 多 AI 扇出 + 双语 + 占位页 + 打磨 | 🔲 待规划 | GPT/Gemini 扇出、中英双语、Marketplace/Arena 真实化 |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | Next.js 15 (Turbopack, App Router) |
| UI | Tailwind v4 + shadcn/ui |
| 状态管理 | Zustand (chatStore / workflowStore / orchestraStore) |
| 动画 | Framer Motion |
| 节点图 | @xyflow/react (React Flow) |
| 实时通信 | Socket.io (python-socketio ASGI) |
| 图标 | lucide-react |
| 字体 | Inter (next/font) |
| 后端框架 | Python FastAPI |
| 数据库 | PostgreSQL 16 + SQLAlchemy async + asyncpg |
| AI | Anthropic Claude (Haiku 4.5 / Sonnet 4.6), OpenAI GPT, Google Gemini |
| 容器化 | Docker Compose (db + backend + frontend) |

---

## 路由结构

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

## 关键架构决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 会话状态机 | 后端内存 dict，per session_id | 简单可靠，Phase 3 足够用 |
| 3 Agent 模型 | Orchestrator(Haiku) + Clarifier(Sonnet) + Designer(Sonnet) | 路由轻量低延迟，核心功能用质量优先 |
| 工作流确认流程 | 永远先澄清再确认，不自动生成 | 用户掌控感，避免错误工作流 |
| Approval Window | Phase 6 实现（执行引擎阶段） | 只在节点真正执行危险操作时才需要 |
| Sub-chat | Phase 5 实现 | 避免 Phase 3 复杂度过高 |
| DB 持久化 | 仅 Workflow + ChatMessage | ConversationState 内存即可，重启无历史符合 Demo 定位 |

---

## Phase 间依赖关系

```
Phase 3 (Orchestra 接线)
  ↓ 产出：真实工作流数据结构
Phase 4 (Workflows 画布)    ← 依赖 Phase 3 的工作流数据
Phase 5 (Sub-chat)          ← 依赖 Phase 3 的对话架构
Phase 6 (执行引擎)          ← 依赖 Phase 4 的节点展示
Phase 7 (打磨)              ← 依赖所有前序 Phase
```

---

## 详细 Plan 文件索引

| Phase | 详细 Plan 文件 |
|-------|---------------|
| Phase 3 | [phase3-orchestra-wiring.md](./phase3-orchestra-wiring.md) |
| Phase 4+ | 待规划 |
