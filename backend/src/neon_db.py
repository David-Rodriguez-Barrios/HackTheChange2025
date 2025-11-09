import os
from typing import Optional
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine

_engine: Optional[AsyncEngine] = None


async def init_db_pool():
    """Initialize the database connection pool"""
    global _engine
    
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL environment variable is required")
    
    # Convert postgres:// to postgresql+asyncpg:// for SQLAlchemy async
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif not database_url.startswith("postgresql+asyncpg://"):
        database_url = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    
    if _engine is None:
        _engine = create_async_engine(
            database_url,
            echo=False,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
        )


async def close_db_pool():
    """Close the database connection pool"""
    global _engine
    if _engine:
        await _engine.dispose()
        _engine = None


@asynccontextmanager
async def get_session():
    """Get a database session (context manager)"""
    global _engine
    
    if _engine is None:
        await init_db_pool()
    
    async with AsyncSession(_engine) as session:
        yield session

