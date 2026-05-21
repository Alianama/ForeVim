"""
Pre-migration script: creates all tables from ORM models if they don't exist.
This ensures Alembic migrations that ALTER tables have the base tables available.
"""
import asyncio
from sqlalchemy import text
from app.core.database import engine, Base
# Import all models so Base.metadata is fully populated
import app.models.models  # noqa: F401


async def init() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Pastikan enum forecastalgorithm punya semua nilai dari Python enum.
        # create_all tidak mengubah enum yang sudah ada, jadi kita tambah manual.
        for val in ("HOLT_WINTERS", "holt_winters"):
            await conn.execute(text(f"ALTER TYPE forecastalgorithm ADD VALUE IF NOT EXISTS '{val}'"))
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(init())
