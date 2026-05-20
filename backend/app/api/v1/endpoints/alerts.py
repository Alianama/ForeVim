"""
Alerts API endpoints.
"""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.models.models import Alert, AlertStatus, VM
from app.schemas.schemas import AlertAcknowledgeRequest, AlertResponse
from datetime import datetime, timezone

router = APIRouter(prefix="/alerts", tags=["Alerts"])


@router.get("", response_model=List[AlertResponse], summary="List alerts")
async def list_alerts(
    db: DBSession,
    current_user: CurrentUser,
    vm_id: Optional[uuid.UUID] = Query(default=None),
    alert_status: Optional[AlertStatus] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
):
    q = select(Alert).order_by(Alert.created_at.desc()).limit(limit)
    if vm_id:
        q = q.where(Alert.vm_id == vm_id)
    if alert_status:
        q = q.where(Alert.status == alert_status)
    result = await db.execute(q)
    return [AlertResponse.model_validate(a) for a in result.scalars().all()]


@router.post("/{alert_id}/acknowledge", response_model=AlertResponse, summary="Acknowledge alert")
async def acknowledge_alert(
    alert_id: uuid.UUID,
    body: AlertAcknowledgeRequest,
    db: DBSession,
    current_user: CurrentUser,
):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.status = AlertStatus.ACKNOWLEDGED
    alert.acknowledged_by = current_user.id
    alert.acknowledged_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(alert)
    return AlertResponse.model_validate(alert)


@router.post("/{alert_id}/resolve", response_model=AlertResponse, summary="Resolve alert")
async def resolve_alert(alert_id: uuid.UUID, db: DBSession, current_user: CurrentUser):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.status = AlertStatus.RESOLVED
    alert.resolved_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(alert)
    return AlertResponse.model_validate(alert)
