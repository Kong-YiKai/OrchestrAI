## Backend Notes

- 统一通过根目录 `docker compose up --build` 启动（含 PostgreSQL + backend + frontend）
- FastAPI + python-socketio, ASGI 入口: `main.py` → `socket_app`
- Dockerfile CMD: `uvicorn main:socket_app --host 0.0.0.0 --port 8000`（容器内自动运行）
- 数据库: PostgreSQL + SQLAlchemy async (asyncpg), 配置在 `database.py`
- Pydantic 模型 (`models/workflow.py`, `models/chat.py`) 用于 API 层
- ORM 模型 (`models/db.py`) 用于数据库层
- Workflow CRUD: `services/workflow_db.py` (不再使用内存 dict)
- 所有配置通过 `config.py` (pydantic-settings) 从 `.env` 加载
- Socket.io 事件定义在 `main.py` 和 `socket_manager.py`
