"""
SQLAlchemy ORM models for PostgreSQL.
All metric data stays in Prometheus — only metadata is stored here.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


# ─── Enums ────────────────────────────────────────────────────────────────────


class UserRole(str, enum.Enum):
    SUPERADMIN = "superadmin"
    ADMIN = "admin"
    VIEWER = "viewer"


class VMStatus(str, enum.Enum):
    HEALTHY = "healthy"
    HIGH = "high"       # replaces WARNING — metric above high threshold
    WARNING = "warning"  # kept for DB backwards compatibility
    CRITICAL = "critical"
    UNKNOWN = "unknown"
    DOWN = "down"


class AlertSeverity(str, enum.Enum):
    INFO = "info"
    HIGH = "high"      # replaces WARNING in new alert model
    WARNING = "warning"  # kept for DB backwards compat
    CRITICAL = "critical"


class AlertStatus(str, enum.Enum):
    ACTIVE = "active"
    RESOLVED = "resolved"
    ACKNOWLEDGED = "acknowledged"


class ForecastMetric(str, enum.Enum):
    CPU = "cpu"
    RAM = "ram"
    DISK = "disk"


class ForecastAlgorithm(str, enum.Enum):
    AUTO = "auto"
    MOVING_AVERAGE = "moving_average"
    LINEAR_REGRESSION = "linear_regression"
    HOLT_WINTERS = "holt_winters"
    PROPHET = "prophet"
    ARIMA = "arima"
    LSTM = "lstm"


# ─── Mixins ───────────────────────────────────────────────────────────────────


class TimestampMixin:
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


# ─── Models ───────────────────────────────────────────────────────────────────


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    role = Column(Enum(UserRole), default=UserRole.VIEWER, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    last_login = Column(DateTime(timezone=True), nullable=True)
    totp_secret = Column(String(100), nullable=True)
    is_2fa_enabled = Column(Boolean, default=False, nullable=False)

    # Relationships
    audit_logs = relationship("AuditLog", back_populates="user", lazy="dynamic")
    notification_preferences = relationship(
        "NotificationPreference", back_populates="user", uselist=False
    )


class PrometheusSource(TimestampMixin, Base):
    __tablename__ = "prometheus_sources"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    url = Column(String(500), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    # Relationships
    vms = relationship("VM", back_populates="prometheus_source", lazy="dynamic")


class VM(TimestampMixin, Base):
    __tablename__ = "vms"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hostname = Column(String(255), nullable=False, index=True)
    ip_address = Column(String(45), nullable=False)
    description = Column(Text, nullable=True)
    location = Column(String(255), nullable=True)
    environment = Column(String(50), default="production")  # production, staging, dev
    cluster = Column(String(100), nullable=True)  # for k8s future support
    tags = Column(String(500), nullable=True)  # comma-separated
    status = Column(Enum(VMStatus), default=VMStatus.UNKNOWN, nullable=False)

    # Prometheus job/instance/source mapping
    prometheus_source_id = Column(
        UUID(as_uuid=True), ForeignKey("prometheus_sources.id", ondelete="SET NULL"), nullable=True
    )
    prometheus_job = Column(String(100), default="node_exporter")
    prometheus_instance = Column(String(255), nullable=True)

    is_active = Column(Boolean, default=True, nullable=False)
    last_seen = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    prometheus_source = relationship("PrometheusSource", back_populates="vms")
    alerts = relationship("Alert", back_populates="vm", lazy="dynamic")
    forecast_results = relationship("ForecastResult", back_populates="vm", lazy="dynamic")

    __table_args__ = (
        UniqueConstraint("hostname", "ip_address", name="uq_vm_host_ip"),
    )


class Alert(TimestampMixin, Base):
    __tablename__ = "alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vm_id = Column(UUID(as_uuid=True), ForeignKey("vms.id", ondelete="CASCADE"), nullable=False)
    severity = Column(Enum(AlertSeverity), nullable=False)
    status = Column(Enum(AlertStatus), default=AlertStatus.ACTIVE, nullable=False)
    metric = Column(String(50), nullable=False)  # cpu, ram, disk, uptime
    message = Column(Text, nullable=False)
    current_value = Column(Float, nullable=True)
    threshold_value = Column(Float, nullable=True)
    acknowledged_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    vm = relationship("VM", back_populates="alerts")
    acknowledger = relationship("User", foreign_keys=[acknowledged_by])


class ForecastResult(TimestampMixin, Base):
    __tablename__ = "forecast_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vm_id = Column(UUID(as_uuid=True), ForeignKey("vms.id", ondelete="CASCADE"), nullable=False)
    metric = Column(Enum(ForecastMetric), nullable=False)
    algorithm = Column(Enum(ForecastAlgorithm), nullable=False)
    forecast_period_days = Column(Integer, nullable=False)
    forecast_data = Column(Text, nullable=False)  # JSON blob of forecast points
    accuracy_score = Column(Float, nullable=True)  # MAE or similar
    generated_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    vm = relationship("VM", back_populates="forecast_results")


class AnomalyLog(TimestampMixin, Base):
    __tablename__ = "anomaly_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vm_id = Column(UUID(as_uuid=True), ForeignKey("vms.id", ondelete="CASCADE"), nullable=False)
    metric = Column(String(50), nullable=False)
    detected_at = Column(DateTime(timezone=True), server_default=func.now())
    value = Column(Float, nullable=False)
    expected_value = Column(Float, nullable=True)
    deviation_score = Column(Float, nullable=True)
    description = Column(Text, nullable=True)

    # Relationships
    vm = relationship("VM")


class AuditLog(TimestampMixin, Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(100), nullable=False)
    resource_type = Column(String(100), nullable=True)
    resource_id = Column(String(255), nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    details = Column(Text, nullable=True)  # JSON

    # Relationships
    user = relationship("User", back_populates="audit_logs")


class NotificationPreference(TimestampMixin, Base):
    __tablename__ = "notification_preferences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    telegram_chat_id = Column(String(100), nullable=True)
    slack_webhook_url = Column(String(500), nullable=True)
    email_alerts = Column(Boolean, default=True)
    telegram_alerts = Column(Boolean, default=False)
    slack_alerts = Column(Boolean, default=False)
    alert_on_critical = Column(Boolean, default=True)
    alert_on_warning = Column(Boolean, default=False)

    # Relationships
    user = relationship("User", back_populates="notification_preferences")


class NotificationConfig(TimestampMixin, Base):
    """Global system-wide notification configuration (one row)."""
    __tablename__ = "notification_config"

    id = Column(Integer, primary_key=True, default=1)  # always 1 row

    # ── Thresholds ────────────────────────────────────────────────────────────
    cpu_high_threshold = Column(Float, default=70.0, nullable=False)
    cpu_critical_threshold = Column(Float, default=90.0, nullable=False)
    ram_high_threshold = Column(Float, default=75.0, nullable=False)
    ram_critical_threshold = Column(Float, default=90.0, nullable=False)
    disk_high_threshold = Column(Float, default=70.0, nullable=False)
    disk_critical_threshold = Column(Float, default=85.0, nullable=False)

    # ── Notification toggles ──────────────────────────────────────────────────
    notify_on_high = Column(Boolean, default=True, nullable=False)
    notify_on_critical = Column(Boolean, default=True, nullable=False)

    # ── Frontend URL (for deeplinks in alerts) ────────────────────────────────
    frontend_url = Column(String(500), default="http://localhost:3000", nullable=False)

    # ── Telegram ─────────────────────────────────────────────────────────────
    telegram_enabled = Column(Boolean, default=False, nullable=False)
    telegram_bot_token = Column(String(500), nullable=True)
    telegram_chat_id = Column(String(100), nullable=True)
    telegram_thread_id = Column(String(100), nullable=True)  # for group topics

    # ── Email (SMTP) ──────────────────────────────────────────────────────────
    email_enabled = Column(Boolean, default=False, nullable=False)
    smtp_host = Column(String(255), nullable=True)
    smtp_port = Column(Integer, default=587, nullable=True)
    smtp_username = Column(String(255), nullable=True)
    smtp_password = Column(String(500), nullable=True)
    smtp_from_email = Column(String(255), nullable=True)
    smtp_to_emails = Column(Text, nullable=True)  # comma-separated
    smtp_use_tls = Column(Boolean, default=True, nullable=False)

    # ── SNMP ─────────────────────────────────────────────────────────────────
    snmp_enabled = Column(Boolean, default=False, nullable=False)
    snmp_host = Column(String(255), nullable=True)
    snmp_port = Column(Integer, default=162, nullable=True)
    snmp_community = Column(String(100), default="public", nullable=True)
    snmp_version = Column(String(10), default="2c", nullable=True)  # 1, 2c, 3
