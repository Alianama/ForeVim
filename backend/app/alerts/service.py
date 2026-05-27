"""
Alert detection and notification dispatching.
Supports: Telegram Bot, Email (SMTP), SNMP traps.
Thresholds are loaded dynamically from the notification_config DB table.
"""
from __future__ import annotations

import asyncio
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime, timezone
from typing import Optional
import uuid

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.models import Alert, AlertSeverity, AlertStatus, VM, NotificationConfig
from app.schemas.schemas import VMMetrics
from app.websocket.manager import ws_manager

logger = get_logger(__name__)


# ─── Default thresholds (used as fallback when no DB config exists) ────────────

DEFAULT_CPU_HIGH = 70.0
DEFAULT_CPU_CRITICAL = 90.0
DEFAULT_RAM_HIGH = 75.0
DEFAULT_RAM_CRITICAL = 90.0
DEFAULT_DISK_HIGH = 70.0
DEFAULT_DISK_CRITICAL = 85.0


# ─── Alert Service ────────────────────────────────────────────────────────────


class AlertService:
    async def _get_config(self, db: AsyncSession) -> NotificationConfig:
        """Get or create the global notification config."""
        result = await db.execute(select(NotificationConfig).where(NotificationConfig.id == 1))
        cfg = result.scalar_one_or_none()
        if not cfg:
            cfg = NotificationConfig(
                id=1,
                cpu_high_threshold=DEFAULT_CPU_HIGH,
                cpu_critical_threshold=DEFAULT_CPU_CRITICAL,
                ram_high_threshold=DEFAULT_RAM_HIGH,
                ram_critical_threshold=DEFAULT_RAM_CRITICAL,
                disk_high_threshold=DEFAULT_DISK_HIGH,
                disk_critical_threshold=DEFAULT_DISK_CRITICAL,
            )
            db.add(cfg)
            await db.flush()
        return cfg

    def _compute_vm_status(
        self,
        cfg: NotificationConfig,
        cpu: Optional[float],
        ram: Optional[float],
        disk: Optional[float],
    ) -> str:
        """Compute VM status string based on metric values and thresholds."""
        if cpu is None and ram is None and disk is None:
            return "unknown"

        cpu_val = cpu or 0.0
        ram_val = ram or 0.0
        disk_val = disk or 0.0

        if (
            cpu_val >= cfg.cpu_critical_threshold
            or ram_val >= cfg.ram_critical_threshold
            or disk_val >= cfg.disk_critical_threshold
        ):
            return "critical"
        if (
            cpu_val >= cfg.cpu_high_threshold
            or ram_val >= cfg.ram_high_threshold
            or disk_val >= cfg.disk_high_threshold
        ):
            return "high"
        return "healthy"

    async def evaluate_vm(
        self,
        db: AsyncSession,
        vm: VM,
        metrics: VMMetrics,
    ) -> list[Alert]:
        """Evaluate alert rules for a single VM and persist new alerts."""
        cfg = await self._get_config(db)

        metric_values = {
            "cpu_usage": (metrics.cpu_usage, cfg.cpu_high_threshold, cfg.cpu_critical_threshold),
            "ram_usage": (metrics.ram_usage, cfg.ram_high_threshold, cfg.ram_critical_threshold),
            "disk_usage": (metrics.disk_usage, cfg.disk_high_threshold, cfg.disk_critical_threshold),
        }

        created_alerts: list[Alert] = []

        for metric_name, (value, high_thresh, crit_thresh) in metric_values.items():
            if value is None:
                continue

            # Determine severity
            if value >= crit_thresh and cfg.notify_on_critical:
                severity = AlertSeverity.CRITICAL
                threshold = crit_thresh
                label = "crítikal"
            elif value >= high_thresh and cfg.notify_on_high:
                severity = AlertSeverity.HIGH
                threshold = high_thresh
                label = "tinggi"
            else:
                continue

            # Dedup: don't create duplicate active alert for same metric+severity
            existing_q = select(Alert).where(
                Alert.vm_id == vm.id,
                Alert.metric == metric_name,
                Alert.severity == severity,
                Alert.status == AlertStatus.ACTIVE,
            )
            result = await db.execute(existing_q)
            if result.scalar_one_or_none():
                continue  # Already alerted

            metric_label = metric_name.replace("_usage", "").upper()
            message = (
                f"[{vm.hostname}] {metric_label} usage is {round(value, 1)}% "
                f"— {label} (threshold: {threshold}%)"
            )

            alert = Alert(
                vm_id=vm.id,
                severity=severity,
                status=AlertStatus.ACTIVE,
                metric=metric_name,
                message=message,
                current_value=value,
                threshold_value=threshold,
            )
            db.add(alert)
            created_alerts.append(alert)
            logger.info("alert_created", vm=vm.hostname, metric=metric_name, severity=severity)

        await db.flush()

        # Broadcast via WebSocket + dispatch notifications
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
            asyncio.create_task(self._dispatch_notifications(alert, vm, cfg))

        return created_alerts

    async def _dispatch_notifications(
        self, alert: Alert, vm: VM, cfg: NotificationConfig
    ) -> None:
        """Send notifications to all configured channels."""
        severity_emoji = "🔴" if alert.severity == AlertSeverity.CRITICAL else "🟡"
        deep_link = f"{cfg.frontend_url}/dashboard/vms/{vm.id}"

        message_text = (
            f"{severity_emoji} *ForeVim Alert* [{alert.severity.value.upper()}]\n"
            f"🖥️ *VM:* {vm.hostname}\n"
            f"📊 *Metric:* {alert.metric.replace('_', ' ').title()}\n"
            f"📈 *Value:* {round(alert.current_value or 0, 1)}%\n"
            f"⚠️ *Threshold:* {alert.threshold_value}%\n"
            f"🔗 [View VM]({deep_link})"
        )

        tasks = []
        if cfg.telegram_enabled and cfg.telegram_bot_token and cfg.telegram_chat_id:
            tasks.append(
                self._send_telegram(cfg.telegram_bot_token, cfg.telegram_chat_id,
                                    cfg.telegram_thread_id, message_text)
            )
        if cfg.email_enabled and cfg.smtp_host and cfg.smtp_to_emails:
            tasks.append(self._send_email(cfg, alert, vm, deep_link))

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    @staticmethod
    async def _send_telegram(
        bot_token: str, chat_id: str, thread_id: Optional[str], text: str
    ) -> None:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload: dict = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "Markdown",
            "disable_web_page_preview": False,
        }
        if thread_id:
            payload["message_thread_id"] = int(thread_id)

        async with httpx.AsyncClient(timeout=10) as client:
            try:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
            except Exception as exc:
                logger.warning("telegram_send_failed", error=str(exc))

    @staticmethod
    async def _send_email(
        cfg: NotificationConfig, alert: Alert, vm: VM, deep_link: str
    ) -> None:
        """Send alert email via SMTP (sync in thread executor)."""
        to_list = [e.strip() for e in (cfg.smtp_to_emails or "").split(",") if e.strip()]
        if not to_list:
            return

        severity_color = "#dc2626" if alert.severity == AlertSeverity.CRITICAL else "#d97706"
        severity_label = alert.severity.value.upper()
        metric_label = (alert.metric or "").replace("_usage", "").upper()

        html_body = f"""
        <html><body style="font-family:Inter,sans-serif;background:#0f1117;color:#e2e8f0;padding:24px">
          <div style="max-width:600px;margin:0 auto;background:#1a1f2e;border-radius:12px;overflow:hidden;border:1px solid #2d3748">
            <div style="background:{severity_color};padding:20px 24px">
              <h1 style="margin:0;color:#fff;font-size:20px">🚨 ForeVim Alert — {severity_label}</h1>
            </div>
            <div style="padding:24px">
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:8px 0;color:#94a3b8;width:140px">VM</td><td style="color:#e2e8f0;font-weight:600">{vm.hostname}</td></tr>
                <tr><td style="padding:8px 0;color:#94a3b8">IP Address</td><td style="color:#e2e8f0;font-family:monospace">{vm.ip_address}</td></tr>
                <tr><td style="padding:8px 0;color:#94a3b8">Metric</td><td style="color:#e2e8f0">{metric_label} Usage</td></tr>
                <tr><td style="padding:8px 0;color:#94a3b8">Current Value</td><td style="color:{severity_color};font-weight:700;font-size:18px">{round(alert.current_value or 0, 1)}%</td></tr>
                <tr><td style="padding:8px 0;color:#94a3b8">Threshold</td><td style="color:#e2e8f0">{alert.threshold_value}%</td></tr>
                <tr><td style="padding:8px 0;color:#94a3b8">Time</td><td style="color:#e2e8f0">{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}</td></tr>
              </table>
              <div style="margin-top:20px">
                <p style="color:#94a3b8;font-size:14px">{alert.message}</p>
              </div>
              <a href="{deep_link}" style="display:inline-block;margin-top:20px;background:#6366f1;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">
                View VM Dashboard →
              </a>
            </div>
            <div style="padding:16px 24px;border-top:1px solid #2d3748;color:#4b5563;font-size:12px">
              ForeVim — VM Monitoring &amp; Forecasting Platform
            </div>
          </div>
        </body></html>
        """

        def _send() -> None:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"[ForeVim] {severity_label}: {metric_label} alert on {vm.hostname}"
            msg["From"] = cfg.smtp_from_email or "forevim@example.com"
            msg["To"] = ", ".join(to_list)
            msg.attach(MIMEText(html_body, "html"))

            try:
                if cfg.smtp_use_tls:
                    context = ssl.create_default_context()
                    with smtplib.SMTP(cfg.smtp_host, cfg.smtp_port or 587) as server:
                        server.starttls(context=context)
                        if cfg.smtp_username and cfg.smtp_password:
                            server.login(cfg.smtp_username, cfg.smtp_password)
                        server.sendmail(msg["From"], to_list, msg.as_string())
                else:
                    with smtplib.SMTP(cfg.smtp_host, cfg.smtp_port or 25) as server:
                        if cfg.smtp_username and cfg.smtp_password:
                            server.login(cfg.smtp_username, cfg.smtp_password)
                        server.sendmail(msg["From"], to_list, msg.as_string())
            except Exception as exc:
                logger.warning("email_send_failed", error=str(exc))

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _send)

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
