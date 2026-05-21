"""
Auto-sync endpoint: import VM list directly from Prometheus targets.
Detects all node_exporter instances and bulk-registers them.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AdminOnly, CurrentUser, DBSession
from app.models.models import VM, PrometheusSource
from app.prometheus.client import prometheus_service
from app.prometheus.sources import resolve_prometheus_url
from app.schemas.schemas import (
    VMResponse,
    PrometheusSourceCreate,
    PrometheusSourceUpdate,
    PrometheusSourceResponse,
)

router = APIRouter(prefix="/prometheus", tags=["Prometheus"])


def normalize_prometheus_url(url: str) -> str:
    """Normalisasi IP/URL ke format http://host:port (default 9090)."""
    raw = url.strip()
    if not raw:
        return raw
    if not raw.startswith(("http://", "https://")):
        raw = f"http://{raw}"
    from urllib.parse import urlparse, urlunparse

    parsed = urlparse(raw)
    netloc = parsed.netloc or parsed.path.split("/")[0]
    if ":" not in netloc:
        netloc = f"{netloc}:9090"
    normalized = urlunparse((parsed.scheme or "http", netloc, "", "", "", ""))
    return normalized.rstrip("/")

# Job names yang berisi node_exporter (Linux VM metrics)
NODE_EXPORTER_JOBS = {
    "nodeexporter", "node_exporter", "node",
    "inconis", "gag_nikel", "proxmox",
}


# ─── CRUD Prometheus Sources ───────────────────────────────────────────────


@router.get("/sources", response_model=List[PrometheusSourceResponse], summary="List semua Prometheus sources")
async def list_sources(db: DBSession, current_user: CurrentUser):
    """Dapatkan semua daftar Prometheus sources yang terdaftar."""
    result = await db.execute(select(PrometheusSource).order_by(PrometheusSource.name.asc()))
    return list(result.scalars().all())


@router.post(
    "/sources",
    response_model=PrometheusSourceResponse,
    status_code=201,
    summary="Tambah Prometheus source baru",
    dependencies=[AdminOnly],
)
async def create_source(
    db: DBSession,
    current_user: CurrentUser,
    data: PrometheusSourceCreate,
):
    """Tambah Prometheus source baru."""
    source = PrometheusSource(
        name=data.name,
        url=normalize_prometheus_url(data.url),
        is_active=data.is_active,
    )
    db.add(source)
    await db.flush()
    await db.commit()
    await db.refresh(source)
    return source


@router.patch(
    "/sources/{source_id}",
    response_model=PrometheusSourceResponse,
    summary="Update detail Prometheus source",
    dependencies=[AdminOnly],
)
async def update_source(
    db: DBSession,
    current_user: CurrentUser,
    source_id: uuid.UUID,
    data: PrometheusSourceUpdate,
):
    """Update detail Prometheus source."""
    result = await db.execute(select(PrometheusSource).where(PrometheusSource.id == source_id))
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    
    updates = data.model_dump(exclude_unset=True)
    if "url" in updates:
        updates["url"] = normalize_prometheus_url(updates["url"])
    for field, val in updates.items():
        setattr(source, field, val)
    
    await db.flush()
    await db.commit()
    await db.refresh(source)
    return source


@router.delete(
    "/sources/{source_id}",
    status_code=204,
    summary="Hapus Prometheus source",
    dependencies=[AdminOnly],
)
async def delete_source(
    db: DBSession,
    current_user: CurrentUser,
    source_id: uuid.UUID,
):
    """Hapus Prometheus source."""
    result = await db.execute(select(PrometheusSource).where(PrometheusSource.id == source_id))
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    
    await db.delete(source)
    await db.commit()
    return


# ─── Discovery & Targets ───────────────────────────────────────────────────


@router.get("/targets", summary="List semua Prometheus targets")
async def list_prometheus_targets(
    db: DBSession,
    current_user: CurrentUser,
    source_id: Optional[uuid.UUID] = Query(None),
):
    """Tampilkan semua active target dari Prometheus."""
    url = await resolve_prometheus_url(db, source_id)
    targets = await prometheus_service.list_targets(url=url)
    result = []
    for t in targets:
        labels = t.get("labels", {})
        result.append({
            "job": labels.get("job"),
            "instance": labels.get("instance"),
            "health": t.get("health"),
            "last_scrape": t.get("lastScrape"),
            "scrape_url": t.get("scrapeUrl"),
        })
    return {"total": len(result), "targets": result}


@router.get("/retention", summary="Get Prometheus retention period in days")
async def get_prometheus_retention(
    db: DBSession,
    current_user: CurrentUser,
    source_id: Optional[uuid.UUID] = Query(None),
):
    """Ambil durasi penyimpanan (retention) maksimum dari Prometheus dalam jumlah hari."""
    url = await resolve_prometheus_url(db, source_id)
    retention_days = await prometheus_service.get_retention_days(url=url)
    return {"retention_days": retention_days}


@router.get("/jobs", summary="List semua unique Prometheus jobs")
async def list_prometheus_jobs(
    db: DBSession,
    current_user: CurrentUser,
    source_id: Optional[uuid.UUID] = Query(None),
):
    """Ambil daftar unique job names dari active Prometheus targets."""
    url = await resolve_prometheus_url(db, source_id)
    targets = await prometheus_service.list_targets(url=url)
    jobs = set()
    for t in targets:
        labels = t.get("labels", {})
        job = labels.get("job")
        if job:
            jobs.add(job)
    return sorted(list(jobs))


@router.get("/origins", summary="List semua unique Prometheus origins")
async def list_prometheus_origins(
    db: DBSession,
    current_user: CurrentUser,
    source_id: Optional[uuid.UUID] = Query(None),
):
    """Ambil daftar unique origin_prometheus names dari active Prometheus targets atau node_uname_info."""
    url = await resolve_prometheus_url(db, source_id)
    targets = await prometheus_service.list_targets(url=url)
    origins = set()
    for t in targets:
        labels = t.get("labels", {})
        origin = labels.get("origin_prometheus")
        if origin:
            origins.add(origin)

    try:
        results = await prometheus_service.query("node_uname_info - 0", url=url)
        for r in results:
            metric = r.get("metric", {})
            origin = metric.get("origin_prometheus")
            if origin:
                origins.add(origin)
    except Exception:
        pass

    return sorted(list(origins))


@router.get("/node-targets", summary="Hanya tampilkan node_exporter targets")
async def list_node_targets(
    db: DBSession,
    current_user: CurrentUser,
    source_id: Optional[uuid.UUID] = Query(None),
):
    """Filter targets yang merupakan Linux VM (node_exporter)."""
    url = await resolve_prometheus_url(db, source_id)
    targets = await prometheus_service.list_targets(url=url)
    node_targets = []
    for t in targets:
        labels = t.get("labels", {})
        job = labels.get("job", "")
        instance = labels.get("instance", "")
        # Filter: job yang ada di daftar node_exporter jobs DAN port 9100/9101
        is_node = (
            job.lower() in NODE_EXPORTER_JOBS
            or "9100" in instance
            or "9101" in instance
        )
        if is_node:
            node_targets.append({
                "job": job,
                "instance": instance,
                "health": t.get("health"),
                "ip": instance.split(":")[0],
                "port": instance.split(":")[-1] if ":" in instance else "9100",
            })
    return {"total": len(node_targets), "targets": node_targets}


@router.post(
    "/sync-vms",
    response_model=Dict[str, Any],
    summary="Sinkronisasi VM dari Prometheus ke database",
    dependencies=[AdminOnly],
)
async def sync_vms_from_prometheus(
    db: DBSession,
    current_user: CurrentUser,
    source_id: uuid.UUID = Query(..., description="Prometheus source ID to sync from"),
    job: Optional[str] = Query(None, description="Prometheus job name to selectively sync or 'all' to scan all jobs"),
    origin_prometheus: Optional[str] = Query(None, description="Prometheus origin name to selectively sync or 'all' to scan all origins"),
):
    """
    Otomatis import semua Linux VM yang terdaftar di Prometheus.
    VM yang sudah ada (berdasarkan prometheus_instance) tidak akan duplikat.
    Menggunakan node_uname_info untuk mengambil hostname real dari OS.
    """
    url = await resolve_prometheus_url(db, source_id)
    targets = await prometheus_service.list_targets(url=url)

    # Query node_uname_info dari Prometheus untuk mapping instance IP ke OS Hostname
    filters = []
    if job and job != "all":
        filters.append(f'job=~"{job}"')
    if origin_prometheus and origin_prometheus != "all":
        filters.append(f'origin_prometheus=~"{origin_prometheus}"')

    filter_str = f"{{{', '.join(filters)}}}" if filters else ""
    promql = f"node_uname_info{filter_str} - 0"

    uname_map = {}
    try:
        uname_results = await prometheus_service.query(promql, url=url)
        for r in uname_results:
            metric = r.get("metric", {})
            inst = metric.get("instance")
            nodename = metric.get("nodename") or metric.get("hostname") or metric.get("alias")
            if inst and nodename:
                uname_map[inst] = nodename
                # Map IP-only fallback
                if ":" in inst:
                    ip_only = inst.split(":")[0]
                    if ip_only not in uname_map:
                        uname_map[ip_only] = nodename
    except Exception as exc:
        # Gracefully handle query failures
        from app.prometheus.client import logger
        logger.error("error_querying_node_uname_info", error=str(exc))

    created = []
    skipped = []
    errors = []
    processed_ips = set()

    for t in targets:
        labels = t.get("labels", {})
        target_job = labels.get("job", "")
        instance = labels.get("instance", "")
        target_origin = labels.get("origin_prometheus", "")

        # Filter: hanya sync job terpilih jika dikirim
        if job and job != "all":
            if target_job != job:
                continue
        elif not job:
            # Filter default: hanya node_exporter (Linux VM)
            is_node = (
                target_job.lower() in NODE_EXPORTER_JOBS
                or (("9100" in instance or "9101" in instance) and not instance.startswith("http"))
            )
            if not is_node:
                continue

        # Filter: hanya sync origin terpilih jika dikirim
        if origin_prometheus and origin_prometheus != "all":
            if target_origin != origin_prometheus:
                continue

        # Skip jika bukan IP:port
        if not instance or ":" not in instance:
            continue

        ip = instance.split(":")[0]

        # Skip jika IP ini sudah diproses dalam batch sync yang sama untuk menghindari duplikasi key
        if ip in processed_ips:
            skipped.append({"instance": instance, "reason": "IP sudah diproses dalam batch ini"})
            continue

        # Skip non-IP (hostname container, dll)
        if not ip[0].isdigit():
            skipped.append({"instance": instance, "reason": "bukan IP address"})
            continue

        processed_ips.add(ip)

        # Resolve target hostname first
        # 1. Gunakan node_uname_info map
        target_hostname = uname_map.get(instance) or uname_map.get(ip)

        # 2. Fallback ke target labels
        if not target_hostname:
            target_hostname = (
                labels.get("nodename")
                or labels.get("hostname")
                or labels.get("alias")
            )

        # 3. Fallback parsing dari instance label jika bukan IP raw
        if not target_hostname:
            inst_host = instance.split(":")[0] if instance and ":" in instance else instance
            if inst_host and not inst_host.replace(".", "").isdigit():
                target_hostname = inst_host

        # 4. Fallback final ke format vm-IP
        if not target_hostname:
            target_hostname = f"vm-{ip.replace('.', '-')}"

        # Cek apakah sudah ada (berdasarkan IP address ATAU instance identifier)
        existing = await db.execute(
            select(VM).where(
                (VM.prometheus_instance == instance) |
                (VM.ip_address == ip)
            )
        )
        vm = existing.scalars().first()
        if vm:
            # Jika hostname di database berbeda dengan target_hostname yang didapat, update!
            # Dan selalu izinkan update jika saat ini hostname di database bertipe 'vm-IP' (fallback)
            is_old_fallback = vm.hostname.startswith("vm-")
            is_new_real = not target_hostname.startswith("vm-")
            
            should_update_hostname = target_hostname and (vm.hostname != target_hostname or (is_old_fallback and is_new_real))
            # Jika kita mendeteksi port standard 9100 atau 9101, lebih disukai untuk mengupdate prometheus_instance ke target ini agar scraping valid
            is_standard_port = "9100" in instance or "9101" in instance
            should_update_instance = vm.prometheus_instance != instance and (is_standard_port or not vm.prometheus_instance)
            should_update_source = vm.prometheus_source_id != source_id

            if should_update_hostname or should_update_instance or should_update_source:
                old_hostname = vm.hostname
                if should_update_hostname:
                    vm.hostname = target_hostname
                if should_update_instance:
                    vm.prometheus_instance = instance
                    vm.prometheus_job = target_job
                if should_update_source:
                    vm.prometheus_source_id = source_id
                await db.flush()
                skipped.append({
                    "instance": instance,
                    "reason": f"updated hostname/source from {old_hostname} to {target_hostname}"
                })
            else:
                skipped.append({"instance": instance, "reason": "sudah terdaftar"})
            continue

        # Buat VM baru
        try:
            from app.models.models import VMStatus
            vm = VM(
                hostname=target_hostname,
                ip_address=ip,
                description=f"Auto-imported dari Prometheus job={target_job}",
                environment="production",
                prometheus_job=target_job,
                prometheus_instance=instance,
                prometheus_source_id=source_id,
                status=VMStatus.UNKNOWN,
            )
            db.add(vm)
            await db.flush()
            created.append({
                "hostname": vm.hostname,
                "ip": ip,
                "instance": instance,
                "job": target_job,
            })
        except Exception as exc:
            errors.append({"instance": instance, "error": str(exc)})

    await db.commit()

    return {
        "created": len(created),
        "skipped": len(skipped),
        "errors": len(errors),
        "details": {
            "created": created,
            "skipped": skipped,
            "errors": errors,
        },
    }


