"""
ForecastService: data pipeline + model execution + cache per VM.
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.forecasting.algorithms import AutoForecaster, get_forecaster
from app.forecasting.preprocessing import downsample_for_display, required_lookback_hours
from app.forecasting.storage import get_latest_forecast, save_forecast_result
from app.models.models import ForecastAlgorithm, ForecastMetric, VM
from app.prometheus.client import prometheus_service
from app.prometheus.instance_resolver import fetch_metric_history
from app.schemas.schemas import ForecastPoint, ForecastResponse

logger = get_logger(__name__)

METRIC_QUERY_MAP: Dict[ForecastMetric, Tuple[str, bool]] = {
    ForecastMetric.CPU: ("cpu_usage", False),
    ForecastMetric.RAM: ("ram_usage_percent", False),
    ForecastMetric.DISK: ("disk_usage_percent", False),
}

# Minimum required raw data points per metric before forecasting
METRIC_MIN_POINTS: Dict[ForecastMetric, int] = {
    ForecastMetric.CPU: 8,
    ForecastMetric.RAM: 8,
    ForecastMetric.DISK: 4,  # Allow forecasting with fewer disk points
}

MIN_RAW_POINTS = 8
MIN_FORECAST_POINTS = 12


def _resolve_step_and_interval(period_days: int) -> Tuple[str, int]:
    if period_days <= 1:
        return "5m", 5
    if period_days <= 7:
        return "10m", 10
    if period_days <= 30:
        return "30m", 30
    return "1h", 60


class ForecastService:
    async def generate_forecast(
        self,
        vm: VM,
        metric: ForecastMetric,
        algorithm: ForecastAlgorithm,
        period_days: int,
        *,
        retention_days: Optional[int] = None,
    ) -> ForecastResponse:
        query_key, aggregate = METRIC_QUERY_MAP[metric]
        step, interval_minutes = _resolve_step_and_interval(period_days)

        lookback_hours = required_lookback_hours(period_days, interval_minutes)
        lookback_hours = min(lookback_hours, settings.FORECAST_MAX_LOOKBACK_HOURS)
        if retention_days:
            lookback_hours = min(lookback_hours, retention_days * 24)

        if not vm.prometheus_source:
            return self._empty_response(
                vm.id,
                metric,
                algorithm,
                period_days,
                "VM belum terhubung ke Prometheus source. Sync ulang dari halaman Virtual Machines.",
            )

        # Determine minimum points required for this metric
        min_points = METRIC_MIN_POINTS.get(metric, MIN_RAW_POINTS)
        history_raw, resolved_instance = await fetch_metric_history(
            ip_address=vm.ip_address,
            prometheus_instance=vm.prometheus_instance,
            metric_key=query_key,
            url=vm.prometheus_source.url,
            hours=lookback_hours,
            step=step,
            aggregate=aggregate,
            min_points=min_points,
        )

        display_hist = downsample_for_display(history_raw, max_points=400)
        historical_points = [
            ForecastPoint(timestamp=ts, value=val, is_forecast=False)
            for ts, val in display_hist
        ]

        if len(history_raw) < min_points:
            logger.warning(
                "insufficient_historical_data",
                vm_id=str(vm.id),
                metric=metric.value,
                points=len(history_raw),
                instance=resolved_instance,
            )
            return ForecastResponse(
                vm_id=vm.id,
                metric=metric,
                algorithm=algorithm,
                period_days=period_days,
                historical=historical_points,
                forecast=[],
                accuracy_score=None,
                accuracy_metric=None,
                model_info=(
                    f"Data historis dari Prometheus: {len(history_raw)} titik "
                    f"(minimal {MIN_RAW_POINTS}). Instance: {resolved_instance or 'tidak ditemukan'}. "
                    "Pastikan VM punya prometheus_source_id setelah sync."
                ),
                generated_at=datetime.now(timezone.utc),
            )

        periods = min(int(period_days * 24 * (60 / interval_minutes)), 500)
        forecast_points, accuracy, accuracy_metric, model_info, resolved_algorithm = (
            await self._run_models(
                history_raw,
                periods,
                interval_minutes,
                algorithm,
                vm_id=vm.id,
            )
        )

        if not forecast_points:
            model_info = (
                (model_info or "")
                + f" Model gagal; historis {len(history_raw)} titik tersedia. "
                "Coba algoritma Moving Average atau periode lebih pendek."
            ).strip()

        return ForecastResponse(
            vm_id=vm.id,
            metric=metric,
            algorithm=resolved_algorithm,
            period_days=period_days,
            historical=historical_points,
            forecast=forecast_points,
            accuracy_score=accuracy,
            accuracy_metric=accuracy_metric,
            model_info=model_info,
            generated_at=datetime.now(timezone.utc),
        )

    async def _run_models(
        self,
        history_raw: List[Tuple[datetime, float]],
        periods: int,
        interval_minutes: int,
        algorithm: ForecastAlgorithm,
        *,
        vm_id: uuid.UUID,
    ) -> Tuple[
        List[ForecastPoint],
        Optional[float],
        Optional[str],
        Optional[str],
        ForecastAlgorithm,
    ]:
        forecaster = get_forecaster(algorithm)
        try:
            forecast_points, (accuracy, accuracy_metric) = await asyncio.to_thread(
                forecaster.fit_predict,
                history_raw,
                periods,
                interval_minutes,
            )
        except Exception as exc:
            logger.error("forecast_model_error", algorithm=algorithm.value, error=str(exc))
            forecast_points, (accuracy, accuracy_metric) = [], (None, "mape")

        resolved_algorithm = algorithm
        model_info: Optional[str] = None
        if algorithm == ForecastAlgorithm.AUTO and isinstance(forecaster, AutoForecaster):
            resolved_algorithm = forecaster.last_selected
            model_info = (
                f"Model terpilih: {resolved_algorithm.value.replace('_', ' ').title()} "
                f"(MAPE holdout)."
            )

        if len(forecast_points) < MIN_FORECAST_POINTS:
            for fallback_algo in (
                ForecastAlgorithm.MOVING_AVERAGE,
                ForecastAlgorithm.LINEAR_REGRESSION,
                ForecastAlgorithm.HOLT_WINTERS,
            ):
                if fallback_algo == algorithm:
                    continue
                fb = get_forecaster(fallback_algo)
                forecast_points, (accuracy, accuracy_metric) = await asyncio.to_thread(
                    fb.fit_predict,
                    history_raw,
                    periods,
                    interval_minutes,
                )
                if len(forecast_points) >= MIN_FORECAST_POINTS:
                    logger.info(
                        "forecast_fallback",
                        vm_id=str(vm_id),
                        from_algo=algorithm.value,
                        to_algo=fallback_algo.value,
                    )
                    model_info = (model_info or "") + f" Fallback: {fallback_algo.value}."
                    break

        return forecast_points, accuracy, accuracy_metric, model_info, resolved_algorithm

    async def generate_and_save(
        self,
        vm: VM,
        metric: ForecastMetric,
        algorithm: ForecastAlgorithm,
        period_days: int,
    ) -> ForecastResponse:
        """Generate forecast and persist. Manages its own DB session — never holds a connection during ML."""
        retention_days = None
        if vm.prometheus_source:
            retention_days = await prometheus_service.get_retention_days(
                vm.prometheus_source.url
            )
        response = await self.generate_forecast(
            vm=vm,
            metric=metric,
            algorithm=algorithm,
            period_days=period_days,
            retention_days=retention_days,
        )
        if response.forecast or response.historical:
            async with AsyncSessionLocal() as save_db:
                try:
                    await save_forecast_result(
                        save_db,
                        response,
                        accuracy_metric=response.accuracy_metric,
                        model_info=response.model_info,
                    )
                    await save_db.commit()
                except Exception:
                    await save_db.rollback()
                    logger.warning("forecast_save_failed", vm_id=str(vm.id))
        return response

    async def get_cached_or_generate(
        self,
        vm: VM,
        metric: ForecastMetric,
        algorithm: ForecastAlgorithm,
        period_days: int,
        *,
        force_refresh: bool = False,
    ) -> ForecastResponse:
        """Return cached forecast or generate a new one. Uses its own short-lived sessions."""
        if not force_refresh:
            async with AsyncSessionLocal() as check_db:
                cached = await get_latest_forecast(check_db, vm.id, metric, algorithm, period_days)
            if cached and (cached.forecast or cached.historical):
                return cached
        return await self.generate_and_save(vm, metric, algorithm, period_days)

    @staticmethod
    def _empty_response(
        vm_id: uuid.UUID,
        metric: ForecastMetric,
        algorithm: ForecastAlgorithm,
        period_days: int,
        message: str,
    ) -> ForecastResponse:
        return ForecastResponse(
            vm_id=vm_id,
            metric=metric,
            algorithm=algorithm,
            period_days=period_days,
            historical=[],
            forecast=[],
            accuracy_score=None,
            accuracy_metric=None,
            model_info=message,
            generated_at=datetime.now(timezone.utc),
        )


forecast_service = ForecastService()
