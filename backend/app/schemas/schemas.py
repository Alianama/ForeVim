"""
Pydantic schemas for request/response validation.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

from app.models.models import (
    AlertSeverity,
    AlertStatus,
    ForecastAlgorithm,
    ForecastMetric,
    UserRole,
    VMStatus,
    NotificationConfig,
)

# ─── Base ─────────────────────────────────────────────────────────────────────


class BaseSchema(BaseModel):
    model_config = {"from_attributes": True}


# ─── Auth ─────────────────────────────────────────────────────────────────────


class LoginRequest(BaseModel):
    email: str = Field(..., description="Email address")
    password: str = Field(..., min_length=6)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        # Validasi format email dasar (regex) tanpa cek DNS
        pattern = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
        if not re.match(pattern, v.strip()):
            raise ValueError("Format email tidak valid")
        return v.strip().lower()


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class LoginResponse(BaseModel):
    totp_required: bool = False
    mfa_token: Optional[str] = None
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    expires_in: Optional[int] = None


class Verify2FARequest(BaseModel):
    code: str


class VerifyMFA2FARequest(BaseModel):
    mfa_token: str
    code: str


class Setup2FAResponse(BaseModel):
    secret: str
    provisioning_uri: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


# ─── User ─────────────────────────────────────────────────────────────────────


class UserCreate(BaseModel):
    email: str = Field(..., description="Email address")
    username: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=8)
    full_name: Optional[str] = None
    role: UserRole = UserRole.VIEWER

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        pattern = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
        if not re.match(pattern, v.strip()):
            raise ValueError("Format email tidak valid")
        return v.strip().lower()


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None
    role: Optional[UserRole] = None


class UserResponse(BaseSchema):
    id: uuid.UUID
    email: str
    username: str
    full_name: Optional[str]
    role: UserRole
    is_active: bool
    is_verified: bool
    last_login: Optional[datetime]
    is_2fa_enabled: bool
    created_at: datetime


# ─── Prometheus Source ─────────────────────────────────────────────────────────


class PrometheusSourceBase(BaseSchema):
    name: str = Field(..., min_length=1, max_length=255)
    url: str = Field(..., min_length=1, max_length=500)
    is_active: bool = True


class PrometheusSourceCreate(PrometheusSourceBase):
    pass


class PrometheusSourceUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    is_active: Optional[bool] = None


class PrometheusSourceResponse(BaseSchema):
    id: uuid.UUID
    name: str
    url: str
    is_active: bool
    created_at: datetime


# ─── VM ───────────────────────────────────────────────────────────────────────


class VMCreate(BaseModel):
    hostname: str = Field(..., min_length=1, max_length=255)
    ip_address: str = Field(..., pattern=r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$")
    description: Optional[str] = None
    location: Optional[str] = None
    environment: str = "production"
    cluster: Optional[str] = None
    tags: Optional[str] = None
    prometheus_source_id: Optional[uuid.UUID] = None
    prometheus_job: str = "node_exporter"
    prometheus_instance: Optional[str] = None


class VMUpdate(BaseModel):
    description: Optional[str] = None
    location: Optional[str] = None
    environment: Optional[str] = None
    cluster: Optional[str] = None
    tags: Optional[str] = None
    is_active: Optional[bool] = None
    prometheus_source_id: Optional[uuid.UUID] = None
    prometheus_job: Optional[str] = None
    prometheus_instance: Optional[str] = None


class VMResponse(BaseSchema):
    id: uuid.UUID
    hostname: str
    ip_address: str
    description: Optional[str]
    location: Optional[str]
    environment: str
    cluster: Optional[str]
    tags: Optional[str]
    status: VMStatus
    prometheus_source_id: Optional[uuid.UUID] = None
    prometheus_job: str
    prometheus_instance: Optional[str]
    is_active: bool
    last_seen: Optional[datetime]
    created_at: datetime


class VMListResponse(BaseModel):
    total: int
    vms: List[VMResponse]


# ─── Metrics ──────────────────────────────────────────────────────────────────


class MetricDataPoint(BaseModel):
    timestamp: datetime
    value: float


class VMMetrics(BaseModel):
    vm_id: uuid.UUID
    hostname: str
    cpu_usage: Optional[float] = None
    cpu_cores: Optional[int] = None
    ram_usage: Optional[float] = None
    ram_total_gb: Optional[float] = None
    ram_used_gb: Optional[float] = None
    disk_usage: Optional[float] = None
    disk_total_gb: Optional[float] = None
    disk_used_gb: Optional[float] = None
    network_rx_mbps: Optional[float] = None
    network_tx_mbps: Optional[float] = None
    uptime_seconds: Optional[float] = None
    load_avg_1m: Optional[float] = None
    load_avg_5m: Optional[float] = None
    load_avg_15m: Optional[float] = None
    status: VMStatus
    collected_at: datetime


class VMHistoryResponse(BaseModel):
    vm_id: uuid.UUID
    metric: str
    step: str
    data: List[MetricDataPoint]


class DiskMount(BaseModel):
    mountpoint: str
    device: str
    fstype: str
    total_gb: float
    used_gb: float
    avail_gb: float
    usage_percent: float


# ─── Forecast ─────────────────────────────────────────────────────────────────


class ForecastRequest(BaseModel):
    metric: ForecastMetric
    algorithm: ForecastAlgorithm = ForecastAlgorithm.HOLT_WINTERS
    period_days: int = Field(default=7, ge=1, le=30)


class ForecastPoint(BaseModel):
    timestamp: datetime
    value: float
    lower_bound: Optional[float] = None
    upper_bound: Optional[float] = None
    is_forecast: bool = False


class ForecastResponse(BaseModel):
    vm_id: uuid.UUID
    metric: ForecastMetric
    algorithm: ForecastAlgorithm
    period_days: int
    historical: List[ForecastPoint]
    forecast: List[ForecastPoint]
    accuracy_score: Optional[float] = None
    accuracy_metric: Optional[str] = None  # mape | mae | r2
    model_info: Optional[str] = None
    generated_at: datetime


class ForecastHistoryItem(BaseSchema):
    id: uuid.UUID
    vm_id: uuid.UUID
    metric: ForecastMetric
    algorithm: ForecastAlgorithm
    forecast_period_days: int
    accuracy_score: Optional[float] = None
    generated_at: datetime
    has_forecast: bool = True


# ─── Recommendation ─────────────────────────────────────────────────────────────


class ResourceRecommendation(BaseModel):
    action: str  # INCREASE, DECREASE, KEEP
    current_capacity: Optional[float] = None
    recommended_capacity: Optional[float] = None
    reason: str


class RecommendationResponse(BaseModel):
    vm_id: uuid.UUID
    period_days: int
    cpu: ResourceRecommendation
    ram: ResourceRecommendation
    disk: ResourceRecommendation
    generated_at: datetime


# ─── Alert ────────────────────────────────────────────────────────────────────


class AlertResponse(BaseSchema):
    id: uuid.UUID
    vm_id: uuid.UUID
    severity: AlertSeverity
    status: AlertStatus
    metric: str
    message: str
    current_value: Optional[float]
    threshold_value: Optional[float]
    acknowledged_at: Optional[datetime]
    resolved_at: Optional[datetime]
    created_at: datetime


class AlertAcknowledgeRequest(BaseModel):
    notes: Optional[str] = None


# ─── Dashboard ────────────────────────────────────────────────────────────────


class DashboardSummary(BaseModel):
    total_vms: int
    healthy_vms: int
    high_vms: int
    warning_vms: int  # legacy, kept for compatibility
    critical_vms: int
    unknown_vms: int
    down_vms: int
    avg_cpu: float
    avg_ram: float
    avg_disk: float
    active_alerts: int
    critical_alerts: int


# ─── WebSocket ────────────────────────────────────────────────────────────────


class WSMessage(BaseModel):
    event: str
    data: Any
    timestamp: datetime


class WSMetricsPayload(BaseModel):
    vm_id: str
    metrics: VMMetrics


class WSAlertPayload(BaseModel):
    alert: AlertResponse
    vm_hostname: str


# ─── Health ───────────────────────────────────────────────────────────────────


class HealthResponse(BaseModel):
    status: str
    version: str
    environment: str
    database: str
    prometheus: str
    timestamp: datetime


# ─── Notification Config ───────────────────────────────────────────────────────────────


class NotificationConfigUpdate(BaseModel):
    # Thresholds
    cpu_high_threshold: Optional[float] = None
    cpu_critical_threshold: Optional[float] = None
    ram_high_threshold: Optional[float] = None
    ram_critical_threshold: Optional[float] = None
    disk_high_threshold: Optional[float] = None
    disk_critical_threshold: Optional[float] = None
    # Notification toggles
    notify_on_high: Optional[bool] = None
    notify_on_critical: Optional[bool] = None
    frontend_url: Optional[str] = None
    # Telegram
    telegram_enabled: Optional[bool] = None
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    telegram_thread_id: Optional[str] = None
    # Email
    email_enabled: Optional[bool] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_email: Optional[str] = None
    smtp_to_emails: Optional[str] = None
    smtp_use_tls: Optional[bool] = None
    # SNMP
    snmp_enabled: Optional[bool] = None
    snmp_host: Optional[str] = None
    snmp_port: Optional[int] = None
    snmp_community: Optional[str] = None
    snmp_version: Optional[str] = None


class NotificationConfigResponse(BaseSchema):
    cpu_high_threshold: float
    cpu_critical_threshold: float
    ram_high_threshold: float
    ram_critical_threshold: float
    disk_high_threshold: float
    disk_critical_threshold: float
    notify_on_high: bool
    notify_on_critical: bool
    frontend_url: str
    telegram_enabled: bool
    telegram_bot_token: Optional[str] = None  # masked on GET
    telegram_chat_id: Optional[str] = None
    telegram_thread_id: Optional[str] = None
    email_enabled: bool
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_from_email: Optional[str] = None
    smtp_to_emails: Optional[str] = None
    smtp_use_tls: bool
    snmp_enabled: bool
    snmp_host: Optional[str] = None
    snmp_port: Optional[int] = None
    snmp_community: Optional[str] = None
    snmp_version: Optional[str] = None


class TestNotificationRequest(BaseModel):
    message: Optional[str] = "This is a test notification from ForeVim! ✅"
