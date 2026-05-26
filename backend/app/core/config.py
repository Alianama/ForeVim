"""
Application configuration using Pydantic Settings.
All config values are read from environment variables.
"""
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
import secrets


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        # Ini yang kunci: izinkan string biasa untuk List field
        env_ignore_empty=True,
    )

    # ── Application ────────────────────────────────────────────────────────────
    APP_NAME: str = "ForeVim - VM Monitoring & Forecasting"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "production"

    # ── Security ───────────────────────────────────────────────────────────────
    SECRET_KEY: str = secrets.token_urlsafe(32)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── CORS ───────────────────────────────────────────────────────────────────
    # Diset sebagai string comma-separated di .env
    ALLOWED_ORIGINS_STR: str = "http://localhost:3000,http://localhost:3001"

    # ── Database ───────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://forevim:forevim@localhost:5432/forevim"
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20

    # ── Redis ─────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"
    CACHE_TTL_SECONDS: int = 60

    # ── Prometheus (URL dikelola via web → tabel prometheus_sources) ─────────
    PROMETHEUS_TIMEOUT: int = 30
    METRICS_SCRAPE_INTERVAL: int = 15  # seconds

    # ── Rate Limiting ─────────────────────────────────────────────────────────
    RATE_LIMIT_PER_MINUTE: int = 100

    # ── Forecasting ───────────────────────────────────────────────────────────
    FORECAST_DEFAULT_PERIOD: int = 7  # days
    FORECAST_HISTORY_HOURS: int = 168  # 7 days lookback
    # Background forecast tiap jam memakan CPU (statsmodels); default off — forecast on-demand via API
    FORECAST_SCHEDULER_ENABLED: bool = False
    FORECAST_MAX_LOOKBACK_HOURS: int = 2160  # 90 hari max query Prometheus

    # ── Alerting ──────────────────────────────────────────────────────────────
    ALERT_CPU_THRESHOLD: float = 85.0
    ALERT_RAM_THRESHOLD: float = 90.0
    ALERT_DISK_THRESHOLD: float = 85.0

    # ── Telegram ──────────────────────────────────────────────────────────────
    TELEGRAM_BOT_TOKEN: Optional[str] = None
    TELEGRAM_CHAT_ID: Optional[str] = None

    # ── Slack ─────────────────────────────────────────────────────────────────
    SLACK_WEBHOOK_URL: Optional[str] = None

    # ── Logging ───────────────────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"  # "json" | "text"

    # ── First Superuser ───────────────────────────────────────────────────────
    FIRST_SUPERUSER_EMAIL: str = "admin@forevim.io"
    FIRST_SUPERUSER_PASSWORD: str = "Admin123!"

    @property
    def ALLOWED_ORIGINS(self) -> List[str]:
        """Parse ALLOWED_ORIGINS_STR as comma-separated list."""
        return [o.strip() for o in self.ALLOWED_ORIGINS_STR.split(",") if o.strip()]


settings = Settings()
