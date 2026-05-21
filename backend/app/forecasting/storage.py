"""
Persist & load forecast results per VM.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import ForecastAlgorithm, ForecastMetric, ForecastResult
from app.schemas.schemas import ForecastPoint, ForecastResponse


def _points_to_json(points: List[ForecastPoint]) -> str:
    return json.dumps(
        [
            {
                "timestamp": p.timestamp.isoformat(),
                "value": p.value,
                "lower_bound": p.lower_bound,
                "upper_bound": p.upper_bound,
                "is_forecast": p.is_forecast,
            }
            for p in points
        ]
    )


async def save_forecast_result(
    db: AsyncSession,
    response: ForecastResponse,
    *,
    accuracy_metric: Optional[str] = None,
    model_info: Optional[str] = None,
    ttl_hours: int = 24,
) -> ForecastResult:
    payload = {
        "historical": json.loads(_points_to_json(response.historical)),
        "forecast": json.loads(_points_to_json(response.forecast)),
        "accuracy_metric": accuracy_metric,
        "model_info": model_info,
    }
    row = ForecastResult(
        vm_id=response.vm_id,
        metric=response.metric,
        algorithm=response.algorithm,
        forecast_period_days=response.period_days,
        forecast_data=json.dumps(payload),
        accuracy_score=response.accuracy_score,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=ttl_hours),
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def get_latest_forecast(
    db: AsyncSession,
    vm_id: uuid.UUID,
    metric: ForecastMetric,
    algorithm: ForecastAlgorithm,
    period_days: int,
) -> Optional[ForecastResponse]:
    result = await db.execute(
        select(ForecastResult)
        .where(
            ForecastResult.vm_id == vm_id,
            ForecastResult.metric == metric,
            ForecastResult.algorithm == algorithm,
            ForecastResult.forecast_period_days == period_days,
        )
        .order_by(ForecastResult.generated_at.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    if not row:
        return None

    payload = json.loads(row.forecast_data)

    def _load(points: list) -> List[ForecastPoint]:
        return [
            ForecastPoint(
                timestamp=datetime.fromisoformat(
                    p["timestamp"].replace("Z", "+00:00")
                ),
                value=p["value"],
                lower_bound=p.get("lower_bound"),
                upper_bound=p.get("upper_bound"),
                is_forecast=p.get("is_forecast", False),
            )
            for p in points
        ]

    return ForecastResponse(
        vm_id=row.vm_id,
        metric=row.metric,
        algorithm=row.algorithm,
        period_days=row.forecast_period_days,
        historical=_load(payload.get("historical", [])),
        forecast=_load(payload.get("forecast", [])),
        accuracy_score=row.accuracy_score,
        accuracy_metric=payload.get("accuracy_metric"),
        model_info=payload.get("model_info"),
        generated_at=row.generated_at,
    )


async def list_forecast_history(
    db: AsyncSession,
    vm_id: uuid.UUID,
    *,
    limit: int = 20,
) -> List[ForecastResult]:
    result = await db.execute(
        select(ForecastResult)
        .where(ForecastResult.vm_id == vm_id)
        .order_by(ForecastResult.generated_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())
