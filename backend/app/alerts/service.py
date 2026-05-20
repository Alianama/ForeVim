"""
Alert detection and notification dispatching.
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Optional
import uuid

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.models.models import Alert, AlertSeverity, AlertStatus, VM, VMStatus
from app.schemas.schemas import VMMetrics
from app.websocket.manager import ws_manager

logger = get_logger(__name__)


# ─── Alert Rules ──────────────────────────────────────────────────────────────


class AlertRule:
    def __init__(
        self,
        metric: str,
        threshold: float,
        severity: AlertSeverity,
        message_template: str,
    ) -> None:
        self.metric = metric
        self.threshold = threshold
        self.severity = severity
        self.message_template = message_template

    def check(self, value: Optional[float]) -> bool:
        return value is not None and value >= self.threshold

    def format_message(self, hostname: str, value: float) -> str:
        return self.message_template.format(hostname=hostname, value=round(value, 1))


DEFAULT_RULES = [
    AlertRule("cpu_usage", settings.ALERT_CPU_THRESHOLD, AlertSeverity.CRITICAL,
              "[{hostname}] CPU usage is {value}% — above critical threshold"),
    AlertRule("cpu_usage", 70.0, AlertSeverity.WARNING,
              "[{hostname}] CPU usage is {value}% — elevated"),
    AlertRule("ram_usage", settings.ALERT_RAM_THRESHOLD, AlertSeverity.CRITICAL,
              "[{hostname}] RAM usage is {value}% — above critical threshold"),
    AlertRule("ram_usage", 75.0, AlertSeverity.WARNING,
              "[{hostname}] RAM usage is {value}% — elevated"),
    AlertRule("disk_usage", settings.ALERT_DISK_THRESHOLD, AlertSeverity.CRITICAL,
              "[{hostname}] Disk usage is {value}% — almost full"),
    AlertRule("disk_usage", 70.0, AlertSeverity.WARNING,
              "[{hostname}] Disk usage is {value}% — growing"),
]


# ─── Alert Service ────────────────────────────────────────────────────────────


class AlertService:
    async def evaluate_vm(
        self,
        db: AsyncSession,
        vm: VM,
        metrics: VMMetrics,
    ) -> list[Alert]:
        """Evaluate alert rules for a single VM and persist new alerts."""
        metric_values = {
            "cpu_usage": metrics.cpu_usage,
            "ram_usage": metrics.ram_usage,
            "disk_usage": metrics.disk_usage,
        }

        created_alerts: list[Alert] = []

        for rule in DEFAULT_RULES:
            value = metric_values.get(rule.metric)
            if not rule.check(value):
                continue

            # Dedup: check if an active alert for this metric+severity already exists
            existing_q = select(Alert).where(
                Alert.vm_id == vm.id,
                Alert.metric == rule.metric,
                Alert.severity == rule.severity,
                Alert.status == AlertStatus.ACTIVE,
            )
            result = await db.execute(existing_q)
            existing = result.scalar_one_or_none()

            if existing:
                continue  # Already alerted

            alert = Alert(
                vm_id=vm.id,
                severity=rule.severity,
                status=AlertStatus.ACTIVE,
                metric=rule.metric,
                message=rule.format_message(vm.hostname, value),  # type: ignore
                current_value=value,
                threshold_value=rule.threshold,
            )
            db.add(alert)
            created_alerts.append(alert)
            logger.info("alert_created", vm=vm.hostname, metric=rule.metric, severity=rule.severity)

        await db.flush()

        # Broadcast via WebSocket
        for alert in created_alerts:
            await ws_manager.broadcast(
                "alert",
                {
                    "vm_id": str(vm.id),
                    "hostname": vm.hostname,
                    "severity": alert.severity.value,
                    "metric": alert.metric,
                    "message": alert.message,
                },
            )
            # Fire-and-forget notifications
            asyncio.create_task(self._dispatch_notifications(alert, vm.hostname))

        return created_alerts

    async def _dispatch_notifications(self, alert: Alert, hostname: str) -> None:
        """Send notifications to Telegram/Slack."""
        message = f"🚨 *ForeVim Alert* [{alert.severity.value.upper()}]\n{alert.message}"

        tasks = []
        if settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_CHAT_ID:
            tasks.append(self._send_telegram(message))
        if settings.SLACK_WEBHOOK_URL:
            tasks.append(self._send_slack(message))

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _send_telegram(self, text: str) -> None:
        url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                await client.post(url, json={
                    "chat_id": settings.TELEGRAM_CHAT_ID,
                    "text": text,
                    "parse_mode": "Markdown",
                })
            except Exception as exc:
                logger.warning("telegram_send_failed", error=str(exc))

    async def _send_slack(self, text: str) -> None:
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                await client.post(settings.SLACK_WEBHOOK_URL, json={"text": text})  # type: ignore
            except Exception as exc:
                logger.warning("slack_send_failed", error=str(exc))

    async def resolve_stale_alerts(
        self,
        db: AsyncSession,
        vm_id: uuid.UUID,
        current_metrics: VMMetrics,
    ) -> None:
        """Resolve alerts whose metric is now below threshold."""
        metric_values = {
            "cpu_usage": current_metrics.cpu_usage,
            "ram_usage": current_metrics.ram_usage,
            "disk_usage": current_metrics.disk_usage,
        }

        result = await db.execute(
            select(Alert).where(
                Alert.vm_id == vm_id,
                Alert.status == AlertStatus.ACTIVE,
            )
        )
        active_alerts = result.scalars().all()

        for alert in active_alerts:
            current_val = metric_values.get(alert.metric)
            threshold = alert.threshold_value or 0.0
            if current_val is not None and current_val < threshold * 0.95:  # 5% hysteresis
                alert.status = AlertStatus.RESOLVED
                alert.resolved_at = datetime.now(timezone.utc)
                logger.info("alert_resolved", alert_id=str(alert.id), metric=alert.metric)

        await db.flush()


alert_service = AlertService()
