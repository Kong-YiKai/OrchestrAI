# OrchestrAI

AI 工作流编排平台 Demo —— 用户用自然语言描述想法，AI 实时生成可视化多步骤工作流，每步可选不同 AI 模型执行。

## Tech Stack

- **Frontend**: Next.js 15 (Turbopack) + Tailwind v4 + shadcn/ui + Zustand + Socket.io-client + Framer Motion + @xyflow/react + lucide-react + Inter 字体
- **Backend**: Python FastAPI + Socket.io (ASGI) + SQLAlchemy async + asyncpg
- **Database**: PostgreSQL 16
- **Containerization**: Docker Compose (db + backend + frontend)

## Quick Start

```bash
cp backend/.env.example backend/.env   # 填入 API Key
docker compose up --build               # 一键启动
# 访问 http://localhost:3000/  → 自动跳 /dashboard
```

## Project Structure

```
OrchestrAI/
├── docker-compose.yml
├── frontend/                            # Next.js 15 + 暖色 light theme
│   ├── app/
│   │   ├── globals.css                  # Figma 设计令牌
│   │   ├── layout.tsx                   # Inter 字体
│   │   ├── page.tsx                     # redirect → /dashboard
│   │   └── (app)/                       # App Shell route group
│   │       ├── layout.tsx               # AppSidebar + TopBar 包裹
│   │       ├── dashboard/page.tsx
│   │       ├── orchestra/page.tsx
│   │       ├── workflows/page.tsx
│   │       └── {marketplace,arena,team,settings}/page.tsx  # 占位
│   ├── components/
│   │   ├── layout/                      # AppSidebar, TopBar, ComingSoon
│   │   ├── dashboard/                   # HeroCard, StatCard, ProjectCard
│   │   ├── orchestra/                   # RecentProjectsPanel, ChatThread, ContextPanel(4 tabs)
│   │   ├── workflows/                   # WorkflowCanvas, TaskNodeCard, NodeDetailDrawer, Breadcrumbs
│   │   ├── chat/ + workflow/            # legacy Phase 1 组件（Phase 3 接线时复用 store）
│   │   └── ui/                          # shadcn/ui
│   ├── hooks/                           # useSocket
│   └── stores/                          # workflowStore, chatStore (Zustand)
└── backend/                             # FastAPI（不变）
    ├── main.py
    ├── database.py / models/ / routers/ / services/ / browser/
```

## Key Conventions

- **视觉主题**：暖色 light theme（奶油底 + 橙色 accent + Inter）——tokens 在 `frontend/app/globals.css`
- **图标**：统一用 `lucide-react`
- **路由组**：所有需要 App Shell 的页面放在 `app/(app)/` 下；shell 里含左侧导航 + 顶部栏
- **组件位置**：前端组件在 `frontend/components/<模块>/`（非 `src/components/`）
- Workflow 数据持久化到 PostgreSQL（不使用内存 dict）
- 后端 Pydantic 模型与 ORM 模型分离：`models/workflow.py` (API) vs `models/db.py` (DB)
- Socket.io 事件前缀：`chat:`, `workflow:`, `execution:`
- Docker Compose 中 backend 的 DATABASE_URL 指向 `db` 服务名

## Current Progress

- Phase 1: 核心脚手架 + 分屏布局 ✅（分屏已被 App Shell 取代）
- Phase 1.5: Docker Compose + DB 基础设施 ✅
- Phase 2: **设计系统 + App Shell + 三路由骨架 ✅**（视觉 1:1 对齐 Figma；Dashboard/Orchestra/Workflows 页面结构已实现，数据为占位）
- Phase 2.5: **Orchestra 右栏 Project Context 重构 ✅**（4 个 tab → 4 个竖排 drill-in 卡片；Clarifications / Building Process 两级下钻；History 增加 Undo/Redo；ChatThread 移除冗余 Undo 按钮。组件拆分到 `frontend/components/orchestra/context/`，状态用 View union + goTo/goBack 导航）
- Phase 3: The Orchestra 功能接线（Claude 流式、4 tabs 实数据、Approval Window）pending
- Phase 4: Workflows 画布功能接线（节点持久化、详情抽屉、面包屑）pending
- Phase 5: 嵌套 Sub-chat 分叉 + File Repository pending
- Phase 6: 节点执行引擎（API / Playwright / 模拟）pending
- Phase 7: 多 AI 扇出 + 中英双语 + 占位页真实化 + 打磨 pending
