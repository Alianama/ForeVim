"""
VM Service: business logic for VM CRUD and metric collection.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.alerts.service import alert_service
from app.core.logging import get_logger
from app.models.models import VM, VMStatus, NotificationConfig
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

    async def count_all(self, db: AsyncSession) -> int:
        result = await db.execute(
            select(func.count()).select_from(VM).where(VM.is_active == True)
        )
        return int(result.scalar() or 0)

    async def get_all(
        self, db: AsyncSession, skip: int = 0, limit: int = 100
    ) -> List[VM]:
        result = await db.execute(
            select(VM)
            .options(selectinload(VM.prometheus_source))
            .where(VM.is_active == True)
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_by_id(self, db: AsyncSession, vm_id: uuid.UUID) -> Optional[VM]:
        result = await db.execute(
            select(VM).options(selectinload(VM.prometheus_source)).where(VM.id == vm_id)
        )
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
            prometheus_source_id=data.prometheus_source_id,
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

    async def _check_instance_status(self, instance: str, job: str, url: str) -> Optional[bool]:
        """
        Check if a Prometheus instance is up.
        Returns:
            True  — Prometheus reports up=1
            False — Prometheus reports up=0 (explicitly DOWN)
            None  — Prometheus unreachable / no data (UNKNOWN)
        """
        from app.prometheus.client import QUERIES
        q = QUERIES["up"].format(instance=instance, job=job)
        result = await prometheus_service.query(q, url=url)
        if not result:
            # No data returned — Prometheus may be unreachable or instance never scraped
            return None
        try:
            val = float(result[0]["value"][1])
            return val == 1.0
        except (KeyError, IndexError, ValueError):
            return None

    async def collect_metrics(self, db: AsyncSession, vm: VM) -> VMMetrics:
        """Fetch current metrics from Prometheus and update VM status."""
        instance = vm.prometheus_instance or f"{vm.ip_address}:9100"
        if not vm.prometheus_source:
            await self._update_status(db, vm, VMStatus.UNKNOWN)
            return VMMetrics(
                vm_id=vm.id,
                hostname=vm.hostname,
                status=VMStatus.UNKNOWN,
                collected_at=datetime.now(timezone.utc),
            )
        source_url = vm.prometheus_source.url

        # Check instance status — None means Prometheus unreachable (UNKNOWN, not DOWN)
        instance_up = await self._check_instance_status(
            instance, vm.prometheus_job, url=source_url
        )

        if instance_up is False:
            # Prometheus explicitly reports up=0 → instance is DOWN
            await self._update_status(db, vm, VMStatus.DOWN)
            await ws_manager.broadcast(
                "metrics_update",
                {
                    "vm_id": str(vm.id),
                    "hostname": vm.hostname,
                    "cpu_usage": None,
                    "ram_usage": None,
                    "disk_usage": None,
                    "status": VMStatus.DOWN.value,
                    "collected_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            return VMMetrics(
                vm_id=vm.id,
                hostname=vm.hostname,
                status=VMStatus.DOWN,
                collected_at=datetime.now(timezone.utc),
            )

        if instance_up is None:
            # Cannot reach Prometheus or no data → UNKNOWN (don't mark as DOWN)
            await self._update_status(db, vm, VMStatus.UNKNOWN)
            return VMMetrics(
                vm_id=vm.id,
                hostname=vm.hostname,
                status=VMStatus.UNKNOWN,
                collected_at=datetime.now(timezone.utc),
            )

        # instance_up is True → collect metrics
        raw = await prometheus_service.get_current_metrics(instance, url=source_url)

        cpu = raw.get("cpu_usage")
        cpu_cores = raw.get("cpu_cores")
        ram = raw.get("ram_usage_percent")
        disk = raw.get("disk_usage_percent")
        ram_total = raw.get("ram_total_bytes")
        ram_avail = raw.get("ram_available_bytes")
        net_rx = raw.get("network_rx_bytes")
        net_tx = raw.get("network_tx_bytes")
        # Aggregate per-mount disk data
        mounts = await prometheus_service.get_disk_mounts(instance, url=source_url)
        total_bytes = sum(m.get("total_gb", 0) * 1_073_741_824 for m in mounts)
        avail_bytes = sum(m.get("avail_gb", 0) * 1_073_741_824 for m in mounts)
        disk_total = total_bytes if total_bytes > 0 else None
        disk_avail = avail_bytes if avail_bytes > 0 else None

        # Fetch notification config for thresholds
        cfg_result = await db.execute(select(NotificationConfig).where(NotificationConfig.id == 1))
        cfg = cfg_result.scalar_one_or_none()

        cpu_crit = cfg.cpu_critical_threshold if cfg else 90.0
        cpu_high = cfg.cpu_high_threshold if cfg else 70.0
        ram_crit = cfg.ram_critical_threshold if cfg else 90.0
        ram_high = cfg.ram_high_threshold if cfg else 75.0
        disk_crit = cfg.disk_critical_threshold if cfg else 85.0
        disk_high = cfg.disk_high_threshold if cfg else 70.0

        # Determine status — treat None metric as 0 only for threshold check
        cpu_v = cpu or 0.0
        ram_v = ram or 0.0
        disk_v = disk or 0.0

        if cpu_v >= cpu_crit or ram_v >= ram_crit or disk_v >= disk_crit:
            status = VMStatus.CRITICAL
        elif cpu_v >= cpu_high or ram_v >= ram_high or disk_v >= disk_high:
            status = VMStatus.HIGH
        else:
            status = VMStatus.HEALTHY

        metrics = VMMetrics(
            vm_id=vm.id,
            hostname=vm.hostname,
            cpu_usage=cpu,
            cpu_cores=int(cpu_cores) if cpu_cores else None,
            ram_usage=ram,
            ram_total_gb=round(ram_total / 1e9, 2) if ram_total else None,
            ram_used_gb=round((ram_total - ram_avail) / 1e9, 2)
            if ram_total and ram_avail
            else None,
            disk_usage=disk,
            disk_total_gb=round(disk_total / 1e9, 2) if disk_total else None,
            disk_used_gb=round((disk_total - disk_avail) / 1e9, 2)
            if disk_total and disk_avail
            else None,
            network_rx_mbps=round((net_rx * 8) / 1e6, 4) if net_rx else None,
            network_tx_mbps=round((net_tx * 8) / 1e6, 4) if net_tx else None,
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
                "disk_used_gb": metrics.disk_used_gb,
                "disk_total_gb": metrics.disk_total_gb,
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
        if not vm.prometheus_source:
            return VMHistoryResponse(vm_id=vm.id, metric=metric, step=step, data=[])

        source_url = vm.prometheus_source.url
        raw = await prometheus_service.get_metric_range(
            instance=instance,
            metric_key=query_key,
            hours=hours,
            step=step,
            aggregate=aggregate,
            url=source_url,
        )

        multiplier = 1.0
        if metric in ("network_rx", "network_tx"):
            multiplier = 8.0 / 1e6

        return VMHistoryResponse(
            vm_id=vm.id,
            metric=metric,
            step=step,
            data=[
                MetricDataPoint(timestamp=ts, value=round(val * multiplier, 4))
                for ts, val in raw
            ],
        )

    async def get_dashboard_summary(self, db: AsyncSession) -> DashboardSummary:
        vms = await self.get_all(db)
        status_counts: Dict[str, int] = {s.value: 0 for s in VMStatus}

        for vm in vms:
            status_key = vm.status.value if hasattr(vm.status, "value") else str(vm.status)
            status_key = status_key.lower()
            status_counts[status_key] = status_counts.get(status_key, 0) + 1

        source_url = None
        for vm in vms:
            if vm.prometheus_source and vm.prometheus_source.is_active:
                source_url = vm.prometheus_source.url
                break

        avg_cpu = 0.0
        avg_ram = 0.0
        avg_disk = 0.0

        if source_url:
            cpu_query = '100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'
            ram_query = '100 - ((node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100)'
            disk_query = 'max by (instance) (100 * (1 - (node_filesystem_avail_bytes{fstype!~"tmpfs|devtmpfs|squashfs|overlay|aufs"} / node_filesystem_size_bytes{fstype!~"tmpfs|devtmpfs|squashfs|overlay|aufs"})))'
            
            try:
                cpu_res, ram_res, disk_res = await asyncio.gather(
                    prometheus_service.query(cpu_query, url=source_url),
                    prometheus_service.query(ram_query, url=source_url),
                    prometheus_service.query(disk_query, url=source_url),
                )
                
                cpu_map = {r['metric'].get('instance'): float(r['value'][1]) for r in cpu_res if 'instance' in r.get('metric', {})}
                ram_map = {r['metric'].get('instance'): float(r['value'][1]) for r in ram_res if 'instance' in r.get('metric', {})}
                disk_map = {r['metric'].get('instance'): float(r['value'][1]) for r in disk_res if 'instance' in r.get('metric', {})}
                
                total_cpu, total_ram, total_disk = 0.0, 0.0, 0.0
                cpu_count, ram_count, disk_count = 0, 0, 0
                
                for vm in vms:
                    instance = vm.prometheus_instance or f"{vm.ip_address}:9100"
                    if instance in cpu_map:
                        total_cpu += cpu_map[instance]
                        cpu_count += 1
                    if instance in ram_map:
                        total_ram += ram_map[instance]
                        ram_count += 1
                    if instance in disk_map:
                        total_disk += disk_map[instance]
                        disk_count += 1
                        
                avg_cpu = round(total_cpu / cpu_count, 2) if cpu_count > 0 else 0.0
                avg_ram = round(total_ram / ram_count, 2) if ram_count > 0 else 0.0
                avg_disk = round(total_disk / disk_count, 2) if disk_count > 0 else 0.0
            except Exception as e:
                logger.warning("failed_bulk_metrics_for_summary", error=str(e))

        from app.models.models import Alert, AlertStatus
        alerts_res = await db.execute(select(Alert).where(Alert.status == AlertStatus.ACTIVE))
        active_alerts = alerts_res.scalars().all()
        critical_alerts = [a for a in active_alerts if a.severity == "critical"]

        return DashboardSummary(
            total_vms=len(vms),
            healthy_vms=status_counts.get("healthy", 0),
            high_vms=status_counts.get("high", 0),
            warning_vms=status_counts.get("warning", 0),
            critical_vms=status_counts.get("critical", 0),
            unknown_vms=status_counts.get("unknown", 0),
            down_vms=status_counts.get("down", 0),
            avg_cpu=avg_cpu,
            avg_ram=avg_ram,
            avg_disk=avg_disk,
            active_alerts=len(active_alerts),
            critical_alerts=len(critical_alerts),
        )

    async def _update_status(self, db: AsyncSession, vm: VM, status: VMStatus) -> None:
        vm.status = status
        vm.last_seen = datetime.now(timezone.utc)
        await db.flush()


vm_service = VMService()
