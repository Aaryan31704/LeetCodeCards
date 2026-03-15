"""Database connection and session management for Supabase/PostgreSQL."""

import logging

import asyncpg
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from app.config import get_settings

logger = logging.getLogger(__name__)


def _connection_url_with_ssl(url: str) -> str:
    """Ensure Supabase/cloud Postgres URLs use SSL (required by Supabase)."""
    if not url or "supabase" not in url.lower():
        return url
    sep = "&" if "?" in url else "?"
    if "sslmode=" in url.lower():
        return url
    return url + sep + "sslmode=require"


async def get_pool():
    """Create connection pool. Call once at startup."""
    settings = get_settings()
    if not settings.DATABASE_URL:
        return None
    url = _connection_url_with_ssl(settings.DATABASE_URL)
    try:
        return await asyncpg.create_pool(
            url,
            min_size=1,
            max_size=5,
            command_timeout=60,
        )
    except Exception as e:
        logger.warning("Database connection failed: %s", e)
        return None


_pool = None


async def init_db():
    """Initialize database pool. Called from lifespan."""
    global _pool
    _pool = await get_pool()
    return _pool


async def close_db():
    """Close pool. Called from lifespan."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def get_conn() -> AsyncGenerator[asyncpg.Connection, None]:
    """Get a connection from the pool."""
    global _pool
    if _pool is None:
        _pool = await get_pool()
    if _pool is None:
        raise RuntimeError(
            "Database not configured or unreachable. Set DATABASE_URL in .env and ensure the host is reachable (check URL, internet, and Supabase project status)."
        )
    async with _pool.acquire() as conn:
        yield conn
