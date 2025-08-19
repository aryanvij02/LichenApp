import asyncpg
from typing import AsyncGenerator
from .config import settings

# Global connection pool
pool: asyncpg.Pool = None


async def create_db_pool():
    """Create database connection pool"""
    global pool
    pool = await asyncpg.create_pool(
        settings.database_url,
        min_size=1,
        max_size=10,
        command_timeout=60
    )


async def close_db_pool():
    """Close database connection pool"""
    global pool
    if pool:
        await pool.close()


async def get_db() -> AsyncGenerator[asyncpg.Connection, None]:
    """Dependency to get database connection"""
    async with pool.acquire() as connection:
        yield connection