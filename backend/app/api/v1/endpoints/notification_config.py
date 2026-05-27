"""
Notification Configuration API endpoints.
Manages global alert thresholds, Telegram, Email, and SNMP settings.
"""
from __future__ import annotations

import asyncio
import smtplib
import ssl
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.models.models import NotificationConfig, UserRole
from app.schemas.schemas import (
    NotificationConfigResponse,
    NotificationConfigUpdate,
    TestNotificationRequest,
)

router = APIRouter(prefix="/notification-config", tags=["Notification Config"])

MASK = "••••••••"


def _mask(val: Optional[str]) -> Optional[str]:
    """Mask sensitive values for GET responses."""
    if not val:
        return None
    if len(val) <= 8:
        return MASK
    return val[:4] + MASK + val[-2:]


async def _get_or_create_config(db: AsyncSession) -> NotificationConfig:
    result = await db.execute(select(NotificationConfig).where(NotificationConfig.id == 1))
    cfg = result.scalar_one_or_none()
    if not cfg:
        cfg = NotificationConfig(id=1)
        db.add(cfg)
        await db.flush()
        await db.refresh(cfg)
    return cfg


@router.get("", response_model=NotificationConfigResponse, summary="Get notification config")
async def get_config(db: DBSession, current_user: CurrentUser):
    cfg = await _get_or_create_config(db)
    data = NotificationConfigResponse.model_validate(cfg)
    # Mask sensitive fields before returning
    data.telegram_bot_token = _mask(cfg.telegram_bot_token)
    return data


@router.put("", response_model=NotificationConfigResponse, summary="Update notification config")
async def update_config(
    body: NotificationConfigUpdate,
    db: DBSession,
    current_user: CurrentUser,
):
    if current_user.role not in (UserRole.ADMIN, UserRole.SUPERADMIN):
        raise HTTPException(status_code=403, detail="Admin access required")

    cfg = await _get_or_create_config(db)

    update_data = body.model_dump(exclude_unset=True)

    # Don't overwrite token/password with masked placeholder
    for secret_field in ("telegram_bot_token", "smtp_password"):
        if secret_field in update_data and update_data[secret_field] == MASK:
            del update_data[secret_field]
        elif secret_field in update_data and update_data[secret_field] and "••••" in update_data[secret_field]:
            del update_data[secret_field]

    for field, value in update_data.items():
        setattr(cfg, field, value)

    await db.flush()
    await db.refresh(cfg)

    resp = NotificationConfigResponse.model_validate(cfg)
    resp.telegram_bot_token = _mask(cfg.telegram_bot_token)
    return resp


@router.post("/test-telegram", summary="Send test Telegram message")
async def test_telegram(
    body: TestNotificationRequest,
    db: DBSession,
    current_user: CurrentUser,
):
    cfg = await _get_or_create_config(db)
    if not cfg.telegram_bot_token or not cfg.telegram_chat_id:
        raise HTTPException(status_code=400, detail="Telegram bot token and chat ID are required")

    url = f"https://api.telegram.org/bot{cfg.telegram_bot_token}/sendMessage"
    payload: dict = {
        "chat_id": cfg.telegram_chat_id,
        "text": f"🧪 *ForeVim Test Notification*\n\n{body.message}",
        "parse_mode": "Markdown",
    }
    if cfg.telegram_thread_id:
        payload["message_thread_id"] = int(cfg.telegram_thread_id)

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            result = resp.json()
            if not result.get("ok"):
                raise HTTPException(status_code=400, detail=f"Telegram error: {result}")
        return {"success": True, "message": "Test message sent to Telegram ✅"}
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=400, detail=f"Failed to send Telegram message: {exc}")


@router.post("/test-email", summary="Send test email")
async def test_email(
    body: TestNotificationRequest,
    db: DBSession,
    current_user: CurrentUser,
):
    cfg = await _get_or_create_config(db)
    if not cfg.smtp_host or not cfg.smtp_to_emails:
        raise HTTPException(status_code=400, detail="SMTP host and recipient email(s) are required")

    to_list = [e.strip() for e in cfg.smtp_to_emails.split(",") if e.strip()]

    def _send() -> None:
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText

        msg = MIMEMultipart("alternative")
        msg["Subject"] = "[ForeVim] Test Notification Email"
        msg["From"] = cfg.smtp_from_email or "forevim@example.com"
        msg["To"] = ", ".join(to_list)

        html = f"""
        <html><body style="font-family:Inter,sans-serif;background:#0f1117;color:#e2e8f0;padding:24px">
          <div style="max-width:500px;margin:0 auto;background:#1a1f2e;border-radius:12px;padding:24px;border:1px solid #2d3748">
            <h2 style="color:#6366f1;margin-top:0">🧪 ForeVim Test Email</h2>
            <p style="color:#94a3b8">{body.message}</p>
            <p style="color:#4b5563;font-size:12px;margin-top:24px">ForeVim — VM Monitoring &amp; Forecasting Platform</p>
          </div>
        </body></html>
        """
        msg.attach(MIMEText(html, "html"))

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

    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _send)
        return {"success": True, "message": f"Test email sent to {cfg.smtp_to_emails} ✅"}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to send email: {exc}")
