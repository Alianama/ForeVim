"""
Service for managing metric history in the database.
"""
from typing import List, Tuple, Optional
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.models import MetricHistory, VM, ForecastMetric
from app.prometheus.instance_resolver import fetch_metric_history
from app.core.logging import get_logger

logger = get_logger(__name__)

class MetricHistoryService:
    @staticmethod
    async def add_metrics(
        db: AsyncSession,
        vm: VM,
        metric: ForecastMetric,
        data: List[Tuple[datetime, float]]
    ) -> None:
        """Batch insert metric history points."""
        if not data:
            return

        new_entries = [
            MetricHistory(
                vm_id=vm.id,
                metric=metric,
                timestamp=ts,
                value=val
            )
            for ts, val in data
        ]
        db.add_all(new_entries)
        await db.flush()

    @staticmethod
    async def get_history(
        db: AsyncSession,
        vm: VM,
        metric: ForecastMetric,
        hours: int,
        step: str = "5m",
    ) -> List[Tuple[datetime, float]]:
        """Fetch history from DB, fallback to Prometheus if not enough data."""
        # 1. Try to fetch from DB
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        
        stmt = select(MetricHistory.timestamp, MetricHistory.value).where(
            MetricHistory.vm_id == vm.id,
            MetricHistory.metric == metric,
            MetricHistory.timestamp >= cutoff
        ).order_by(MetricHistory.timestamp.asc())
        
        result = await db.execute(stmt)
        db_data = result.all()

        # 2. Check if we have enough data (e.g., at least 12 points)
        if len(db_data) < 12:
            logger.info("metric_history_insufficient_db", vm=vm.hostname, metric=metric.value)
            # Fallback to Prometheus
            metric_map = {
                ForecastMetric.CPU: "cpu_usage",
                ForecastMetric.RAM: "ram_usage_percent",
                ForecastMetric.DISK: "disk_usage_percent",
            }
            query_key = metric_map[metric]
            
            instance = vm.prometheus_instance or f"{vm.ip_address}:9100"
            if not vm.prometheus_source:
                return []
                
            history, _ = await fetch_metric_history(
                ip_address=vm.ip_address,
                prometheus_instance=vm.prometheus_instance,
                metric_key=query_key,
                url=vm.prometheus_source.url,
                hours=hours,
                step=step,
                aggregate=False,
                min_points=12,
            )
            return history

        return [(row[0], row[1]) for row in db_data]

    @staticmethod
    async def clear_old_history(
        db: AsyncSession,
        retention_days: int
    ) -> None:
        """Remove metrics older than retention_days."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
        await db.execute(delete(MetricHistory).where(MetricHistory.timestamp < cutoff))
        await db.commit()
