from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from config import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db():
    """Create all tables (safe for demo; use Alembic for production migrations)."""
    from models.db import WorkflowRecord, ChatMessageRecord  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def shutdown_db():
    await engine.dispose()


async def get_session() -> AsyncSession:
    async with async_session() as session:
        yield session
