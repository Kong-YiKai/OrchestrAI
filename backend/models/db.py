"""
SQLAlchemy ORM models for persistent storage.

Workflow nodes are stored as JSONB inside the workflow row — they are always
loaded/saved together and this avoids a second table + joins for the demo.
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, String, Text, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class WorkflowRecord(Base):
    __tablename__ = "workflows"

    workflow_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(64), index=True, default="default")
    title: Mapped[str] = mapped_column(String(256), default="")
    title_zh: Mapped[str] = mapped_column(String(256), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    nodes: Mapped[dict] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class ChatMessageRecord(Base):
    __tablename__ = "chat_messages"

    message_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(64), index=True, default="default")
    sender_id: Mapped[str] = mapped_column(String(32), default="")
    content: Mapped[str] = mapped_column(Text, default="")
    message_type: Mapped[str] = mapped_column(String(32), default="text")
    workflow_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class AgentSessionRecord(Base):
    __tablename__ = "agent_sessions"

    session_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    state: Mapped[str] = mapped_column(String(32), default="idle")
    state_json: Mapped[dict] = mapped_column(JSON, default=dict)
    task_list_json: Mapped[dict] = mapped_column(JSON, default=list)
    trajectory_json: Mapped[dict] = mapped_column(JSON, default=list)
    resumable: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class ExecutionTraceRecord(Base):
    __tablename__ = "execution_traces"

    trace_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    workflow_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    node_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    agent: Mapped[str] = mapped_column(String(64), default="")
    event_type: Mapped[str] = mapped_column(String(128), index=True, default="")
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class ApprovalRecord(Base):
    __tablename__ = "approval_records"

    approval_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(64), index=True, default="default")
    workflow_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    node_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    action_type: Mapped[str] = mapped_column(String(128), default="")
    risk_level: Mapped[str] = mapped_column(String(32), default="mutating")
    requested_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    decision: Mapped[str | None] = mapped_column(String(32), nullable=True)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
