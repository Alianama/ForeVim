"""
VM Service: business logic for VM CRUD and metric collection.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Dict, List, Optional
import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts.service import alert_service
from app.core.logging import get_logger
from app.models.models import VM, VMStatus
from app.prometheus.client import prometheus_service
from app.schemas.schemas import (
    DashboardSummary,
    MetricDataPoint,
    VMCreate,
    VMHistoryResponse,
    VMMetrics,
    VMResponse,
    VMUpdate,
)
from app.websocket.manager import ws_manager

logger = get_logger(__name__)

METRIC_TO_QUERY = {
    "cpu": ("cpu_usage", False),
    "ram": ("ram_usage_percent", False),
    "disk": ("disk_usage_percent", False),
    "network_rx": ("network_rx_bytes", True),
    "network_tx": ("network_tx_bytes", True),
    "load": ("load_avg_1m", False),
}


class VMService:
    # ─── CRUD ─────────────────────────────────────────────────────────────────

    async def get_all(self, db: AsyncSession, skip: int = 0, limit: int = 100) -> List[VM]:
        result = await db.execute(
            select(VM).where(VM.is_active == True).offset(skip).limit(limit)
        )
        return list(result.scalars().all())

    async def get_by_id(self, db: AsyncSession, vm_id: uuid.UUID) -> Optional[VM]:
        result = await db.execute(select(VM).where(VM.id == vm_id))
        return result.scalar_one_or_none()

    async def create(self, db: AsyncSession, data: VMCreate) -> VM:
        # Default prometheus_instance to ip:9100 if not provided
        instance = data.prometheus_instance or f"{data.ip_address}:9100"
        vm = VM(
            hostname=data.hostname,
            ip_address=data.ip_address,
            description=data.description,
            location=data.location,
            environment=data.environment,
            cluster=data.cluster,
            tags=data.tags,
            prometheus_job=data.prometheus_job,
            prometheus_instance=instance,
        )
        db.add(vm)
        await db.flush()
        await db.refresh(vm)
        logger.info("vm_created", hostname=vm.hostname, ip=vm.ip_address)
        return vm

    async def update(self, db: AsyncSession, vm: VM, data: VMUpdate) -> VM:
        for field, val in data.model_dump(exclude_none=True).items():
            setattr(vm, field, val)
        await db.flush()
        await db.refresh(vm)
        return vm

    async def delete(self, db: AsyncSession, vm: VM) -> None:
        vm.is_active = False
        await db.flush()

    # ─── Metrics ──────────────────────────────────────────────────────────────

    async def collect_metrics(self, db: AsyncSession, vm: VM) -> VMMetrics:
        """Fetch current metrics from Prometheus and update VM status."""
        instance = vm.prometheus_instance or f"{vm.ip_address}:9100"

        # Check if up
        is_up = await prometheus_service.get_instance_up(instance, vm.prometheus_job)

        if not is_up:
            await self._update_status(db, vm, VMStatus.DOWN)
            return VMMetrics(
                vm_id=vm.id,
                hostname=vm.hostname,
                status=VMStatus.DOWN,
                collected_at=datetime.now(timezone.utc),
            )

        raw = await prometheus_service.get_current_metrics(instance)

        cpu = raw.get("cpu_usage")
        ram = raw.get("ram_usage_percent")
        disk = raw.get("disk_usage_percent")
        ram_total = raw.get("ram_total_bytes")
        ram_avail = raw.get("ram_available_bytes")
        disk_total = raw.get("disk_total_bytes")
        disk_avail = raw.get("disk_avail_bytes")
        net_rx = raw.get("network_rx_bytes")
        net_tx = raw.get("network_tx_bytes")

        # Determine status
        if cpu and cpu >= 85 or ram and ram >= 90 or disk and disk >= 85:
            status = VMStatus.CRITICAL
        elif cpu and cpu >= 70 or ram and ram >= 75 or disk and disk >= 70:
            status = VMStatus.WARNING
        else:
            status = VMStatus.HEALTHY

        metrics = VMMetrics(
            vm_id=vm.id,
            hostname=vm.hostname,
            cpu_usage=cpu,
            ram_usage=ram,
            ram_total_gb=round(ram_total / 1e9, 2) if ram_total else None,
            ram_used_gb=round((ram_total - ram_avail) / 1e9, 2) if ram_total and ram_avail else None,
            disk_usage=disk,
            disk_total_gb=round(disk_total / 1e9, 2) if disk_total else None,
            disk_used_gb=round((disk_total - disk_avail) / 1e9, 2) if disk_total and disk_avail else None,
            network_rx_mbps=round(net_rx / 1e6, 4) if net_rx else None,
            network_tx_mbps=round(net_tx / 1e6, 4) if net_tx else None,
            uptime_seconds=raw.get("uptime_seconds"),
            load_avg_1m=raw.get("load_avg_1m"),
            load_avg_5m=raw.get("load_avg_5m"),
            load_avg_15m=raw.get("load_avg_15m"),
            status=status,
            collected_at=datetime.now(timezone.utc),
        )

        await self._update_status(db, vm, status)

        # Alert evaluation
        await alert_service.evaluate_vm(db, vm, metrics)
        await alert_service.resolve_stale_alerts(db, vm.id, metrics)

        # WebSocket broadcast
        await ws_manager.broadcast(
            "metrics_update",
            {
                "vm_id": str(vm.id),
                "hostname": vm.hostname,
                "cpu_usage": cpu,
                "ram_usage": ram,
                "disk_usage": disk,
                "status": status.value,
                "collected_at": metrics.collected_at.isoformat(),
            },
        )

        return metrics

    async def get_history(
        self,
        vm: VM,
        metric: str,
        hours: int = 24,
        step: str = "5m",
    ) -> VMHistoryResponse:
        instance = vm.prometheus_instance or f"{vm.ip_address}:9100"
        query_key, aggregate = METRIC_TO_QUERY.get(metric, ("cpu_usage", False))

        raw = await prometheus_service.get_metric_range(
            instance=instance,
            metric_key=query_key,
            hours=hours,
            step=step,
            aggregate=aggregate,
        )

        return VMHistoryResponse(
            vm_id=vm.id,
            metric=metric,
            step=step,
            data=[MetricDataPoint(timestamp=ts, value=val) for ts, val in raw],
        )

    async def get_dashboard_summary(self, db: AsyncSession) -> DashboardSummary:
        vms = await self.get_all(db)
        status_counts = {s: 0 for s in VMStatus}
        for vm in vms:
            status_counts[vm.status] = status_counts.get(vm.status, 0) + 1

        # TODO: could pull from cache for speed
        return DashboardSummary(
            total_vms=len(vms),
            healthy_vms=status_counts[VMStatus.HEALTHY],
            warning_vms=status_counts[VMStatus.WARNING],
            critical_vms=status_counts[VMStatus.CRITICAL],
            unknown_vms=status_counts[VMStatus.UNKNOWN],
            down_vms=status_counts[VMStatus.DOWN],
            avg_cpu=0.0,
            avg_ram=0.0,
            avg_disk=0.0,
            active_alerts=0,
            critical_alerts=0,
        )

    async def _update_status(self, db: AsyncSession, vm: VM, status: VMStatus) -> None:
        vm.status = status
        vm.last_seen = datetime.now(timezone.utc)
        await db.flush()


vm_service = VMService()
