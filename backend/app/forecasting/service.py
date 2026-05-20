"""
ForecastService: orchestrates data fetching from Prometheus and running algorithms.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple
import uuid

from app.core.logging import get_logger
from app.forecasting.algorithms import get_forecaster
from app.models.models import ForecastAlgorithm, ForecastMetric
from app.prometheus.client import prometheus_service
from app.schemas.schemas import ForecastPoint, ForecastResponse

logger = get_logger(__name__)

# Map ForecastMetric to Prometheus query key and whether to aggregate
METRIC_QUERY_MAP: Dict[ForecastMetric, Tuple[str, bool]] = {
    ForecastMetric.CPU: ("cpu_usage", False),
    ForecastMetric.RAM: ("ram_usage_percent", False),
    ForecastMetric.DISK: ("disk_usage_percent", False),
}

class ForecastService:
    async def generate_forecast(
        self,
        vm_id: uuid.UUID,
        instance: str,
        metric: ForecastMetric,
        algorithm: ForecastAlgorithm,
        period_days: int,
    ) -> ForecastResponse:
        query_key, aggregate = METRIC_QUERY_MAP[metric]

        # Select dynamic step size and interval_minutes based on period_days
        if period_days <= 1:
            step = "5m"
            interval_minutes = 5
            lookback_hours = 48  # Lookback 2 days for 1 day forecast to get sufficient points
        elif period_days <= 7:
            step = "10m"
            interval_minutes = 10
            lookback_hours = 7 * 24
        elif period_days <= 30:
            step = "30m"
            interval_minutes = 30
            lookback_hours = 30 * 24
        else:
            step = "1h"
            interval_minutes = 60
            lookback_hours = period_days * 24

        # Fetch historical data from Prometheus
        history_raw = await prometheus_service.get_metric_range(
            instance=instance,
            metric_key=query_key,
            hours=lookback_hours,
            step=step,
            aggregate=aggregate,
        )

        if not history_raw:
            logger.warning("no_historical_data", vm_id=str(vm_id), metric=metric)
            return ForecastResponse(
                vm_id=vm_id,
                metric=metric,
                algorithm=algorithm,
                period_days=period_days,
                historical=[],
                forecast=[],
                generated_at=datetime.now(timezone.utc),
            )

        # Number of intervals to forecast based on step size
        periods = int(period_days * 24 * (60 / interval_minutes))

        forecaster = get_forecaster(algorithm)
        forecast_points, accuracy = forecaster.fit_predict(
            historical=history_raw,
            periods=periods,
            interval_minutes=interval_minutes,
        )

        historical_points = [
            ForecastPoint(timestamp=ts, value=val, is_forecast=False)
            for ts, val in history_raw
        ]

        return ForecastResponse(
            vm_id=vm_id,
            metric=metric,
            algorithm=algorithm,
            period_days=period_days,
            historical=historical_points,
            forecast=forecast_points,
            accuracy_score=accuracy,
            generated_at=datetime.now(timezone.utc),
        )


forecast_service = ForecastService()
