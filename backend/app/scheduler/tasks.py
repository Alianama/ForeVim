"""
APScheduler background tasks: metrics refresh, forecast, anomaly detection, cleanup.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import delete, select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.models.models import AnomalyLog, ForecastAlgorithm, ForecastMetric, VM
from app.prometheus.client import prometheus_service
from app.services.vm_service import vm_service
from app.forecasting.service import forecast_service

logger = get_logger(__name__)

scheduler = AsyncIOScheduler(timezone="UTC")


# ─── Task: Refresh VM Metrics ─────────────────────────────────────────────────


async def task_refresh_metrics() -> None:
    logger.info("scheduler_task_start", task="refresh_metrics")
    async with AsyncSessionLocal() as db:
        try:
            vms = await vm_service.get_all(db)
            for vm in vms:
                try:
                    await vm_service.collect_metrics(db, vm)
                except Exception as exc:
                    logger.warning("metric_collect_failed", vm=vm.hostname, error=str(exc))
            await db.commit()
            logger.info("scheduler_task_done", task="refresh_metrics", count=len(vms))
        except Exception as exc:
            await db.rollback()
            logger.error("scheduler_task_error", task="refresh_metrics", error=str(exc))


# ─── Task: Generate Forecasts ─────────────────────────────────────────────────
 
 
async def task_generate_forecasts() -> None:
    if not settings.FORECAST_SCHEDULER_ENABLED:
        return
    logger.info("scheduler_task_start", task="generate_forecasts")
    async with AsyncSessionLocal() as db:
        try:
            vms = await vm_service.get_all(db)
            for vm in vms:
                if not vm.prometheus_source:
                    continue
                for metric in [ForecastMetric.CPU, ForecastMetric.RAM, ForecastMetric.DISK]:
                    try:
                        await forecast_service.generate_and_save(
                            db,
                            vm,
                            metric,
                            ForecastAlgorithm.HOLT_WINTERS,
                            7,
                        )
                    except Exception as exc:
                        logger.warning("forecast_failed", vm=vm.hostname, metric=metric, error=str(exc))
            await db.commit()
        except Exception as exc:
            await db.rollback()
            logger.error("scheduler_task_error", task="generate_forecasts", error=str(exc))
 
 
# ─── Task: Anomaly Detection ──────────────────────────────────────────────────
 
 
async def task_detect_anomalies() -> None:
    """Simple z-score based anomaly detection on CPU usage."""
    import numpy as np
 
    logger.info("scheduler_task_start", task="anomaly_detection")
    async with AsyncSessionLocal() as db:
        try:
            vms = await vm_service.get_all(db)
            for vm in vms:
                if not vm.prometheus_source:
                    continue
                instance = vm.prometheus_instance or f"{vm.ip_address}:9100"
                source_url = vm.prometheus_source.url
                history = await prometheus_service.get_metric_range(
                    instance=instance,
                    metric_key="cpu_usage",
                    hours=3,
                    step="1m",
                    url=source_url,
                )
                if len(history) < 10:
                    continue

                values = [v for _, v in history]
                mean = float(np.mean(values))
                std = float(np.std(values))
                if std == 0:
                    continue

                latest_ts, latest_val = history[-1]
                z_score = abs(latest_val - mean) / std

                if z_score > 3.0:
                    log = AnomalyLog(
                        vm_id=vm.id,
                        metric="cpu_usage",
                        detected_at=latest_ts,
                        value=latest_val,
                        expected_value=mean,
                        deviation_score=round(z_score, 3),
                        description=f"CPU z-score {z_score:.2f} (mean={mean:.1f}%, std={std:.1f}%)",
                    )
                    db.add(log)
                    logger.info("anomaly_detected", vm=vm.hostname, z_score=z_score, value=latest_val)

            await db.commit()
        except Exception as exc:
            await db.rollback()
            logger.error("scheduler_task_error", task="anomaly_detection", error=str(exc))


# ─── Task: Cleanup Old Data ───────────────────────────────────────────────────


async def task_cleanup() -> None:
    """Remove anomaly logs older than 30 days."""
    logger.info("scheduler_task_start", task="cleanup")
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    async with AsyncSessionLocal() as db:
        try:
            await db.execute(
                delete(AnomalyLog).where(AnomalyLog.created_at < cutoff)
            )
            await db.commit()
            logger.info("scheduler_cleanup_done")
        except Exception as exc:
            await db.rollback()
            logger.error("scheduler_task_error", task="cleanup", error=str(exc))


# ─── Scheduler Setup ──────────────────────────────────────────────────────────


def setup_scheduler() -> AsyncIOScheduler:
    scheduler.add_job(
        task_refresh_metrics,
        trigger=IntervalTrigger(seconds=settings.METRICS_SCRAPE_INTERVAL),
        id="refresh_metrics",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.add_job(
        task_generate_forecasts,
        trigger=IntervalTrigger(hours=1),
        id="generate_forecasts",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.add_job(
        task_detect_anomalies,
        trigger=IntervalTrigger(minutes=5),
        id="detect_anomalies",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.add_job(
        task_cleanup,
        trigger=IntervalTrigger(hours=24),
        id="cleanup",
        replace_existing=True,
        max_instances=1,
    )
    return scheduler
