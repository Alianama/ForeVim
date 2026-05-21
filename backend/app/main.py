"""
FastAPI application factory: lifespan, middleware, routes, health checks.
"""
from __future__ import annotations

import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import engine
from app.core.logging import configure_logging, get_logger
from app.models.models import Base
from app.prometheus.client import prometheus_service
from app.scheduler.tasks import setup_scheduler

configure_logging()
logger = get_logger(__name__)

# ─── Lifespan ─────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("startup_begin", app=settings.APP_NAME, version=settings.APP_VERSION)

    # Create tables (use Alembic in production migrations)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed superuser if needed
    await _seed_superuser()

    # Start scheduler
    scheduler = setup_scheduler()
    scheduler.start()
    logger.info("scheduler_started")

    yield

    # Teardown
    scheduler.shutdown(wait=False)
    await prometheus_service.close()
    await engine.dispose()
    logger.info("shutdown_complete")


async def _seed_superuser() -> None:
    from sqlalchemy import select
    from app.core.database import AsyncSessionLocal
    from app.models.models import User, UserRole
    from app.core.security import get_password_hash

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User).where(User.email == settings.FIRST_SUPERUSER_EMAIL)
        )
        if result.scalar_one_or_none():
            return

        user = User(
            email=settings.FIRST_SUPERUSER_EMAIL,
            username="admin",
            hashed_password=get_password_hash(settings.FIRST_SUPERUSER_PASSWORD),
            full_name="System Administrator",
            role=UserRole.SUPERADMIN,
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        await db.commit()
        logger.info("superuser_seeded", email=settings.FIRST_SUPERUSER_EMAIL)


# ─── Rate Limiter ─────────────────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address)


# ─── App Factory ──────────────────────────────────────────────────────────────


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description="VM Monitoring & Forecasting Platform — powered by Prometheus + AI forecasting",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    # Rate limiting
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Request logging middleware
    @app.middleware("http")
    async def log_requests(request: Request, call_next) -> Response:
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        logger.info(
            "http_request",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=duration_ms,
            client=request.client.host if request.client else "unknown",
        )
        response.headers["X-Process-Time"] = str(duration_ms)
        return response

    # Routes
    app.include_router(api_router)

    # Health check
    @app.get("/health", tags=["Health"], include_in_schema=False)
    async def health():
        from app.core.database import AsyncSessionLocal
        from sqlalchemy import text

        db_ok = False
        try:
            async with AsyncSessionLocal() as db:
                await db.execute(text("SELECT 1"))
            db_ok = True
        except Exception:
            pass

        from sqlalchemy import select
        from app.models.models import PrometheusSource

        prom_status = "not_configured"
        prom_sources_ok = 0
        prom_sources_total = 0
        if db_ok:
            try:
                async with AsyncSessionLocal() as db:
                    result = await db.execute(
                        select(PrometheusSource).where(PrometheusSource.is_active.is_(True))
                    )
                    sources = list(result.scalars().all())
                    prom_sources_total = len(sources)
                    for src in sources:
                        if await prometheus_service.is_healthy(src.url):
                            prom_sources_ok += 1
                    if prom_sources_total == 0:
                        prom_status = "not_configured"
                    elif prom_sources_ok == prom_sources_total:
                        prom_status = "ok"
                    elif prom_sources_ok > 0:
                        prom_status = "degraded"
                    else:
                        prom_status = "unreachable"
            except Exception:
                prom_status = "error"

        return {
            "status": "healthy" if db_ok else "degraded",
            "version": settings.APP_VERSION,
            "environment": settings.ENVIRONMENT,
            "database": "ok" if db_ok else "error",
            "prometheus": prom_status,
            "prometheus_sources": {
                "configured": prom_sources_total,
                "reachable": prom_sources_ok,
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    return app


app = create_app()
