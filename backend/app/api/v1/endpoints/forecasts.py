"""
Forecast overview and batch scan endpoints.
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import CurrentUser, DBSession
from app.core.logging import get_logger
from app.forecasting.service import forecast_service
from app.models.models import ForecastAlgorithm, ForecastMetric, ForecastResult
from app.services.vm_service import vm_service
from app.websocket.manager import ws_manager

logger = get_logger(__name__)
router = APIRouter(prefix="/forecasts", tags=["Forecasting"])

# ── In-memory active scan state (single-instance OK) ─────────────────────────
_active_scan: Dict[str, Any] = {}

METRICS = [ForecastMetric.CPU, ForecastMetric.RAM, ForecastMetric.DISK]


# ── Request schemas ───────────────────────────────────────────────────────────

class ForecastScanRequest(BaseModel):
    algorithm: str = "holt_winters"
    period_days: int = 7
    vm_ids: List[str] = []  # empty list = all VMs with Prometheus


# ── Overview endpoint ─────────────────────────────────────────────────────────

@router.get("/overview", summary="Forecast status per VM per metric")
async def get_forecast_overview(db: DBSession, current_user: CurrentUser):
    """
    Returns a list of all active VMs with their latest forecast status
    for each metric (cpu/ram/disk). Shows both valid (non-expired) and
    stale (expired) entries so the UI can distinguish fresh vs stale.
    """
    vms = await vm_service.get_all(db, limit=500)

    # Fetch ALL forecast results (we'll sort/filter in Python)
    result = await db.execute(select(ForecastResult))
    all_rows = result.scalars().all()

    now = datetime.now(timezone.utc)

    # Build two maps: (vm_id_str, metric_str) -> latest ForecastResult
    # Map 1: non-expired only (fresh)
    fresh: Dict[tuple, ForecastResult] = {}
    # Map 2: any (to show stale info even when expired)
    any_map: Dict[tuple, ForecastResult] = {}

    for fr in all_rows:
        key = (str(fr.vm_id), fr.metric.value)
        # Track latest by generated_at for both maps
        if key not in any_map or fr.generated_at > any_map[key].generated_at:
            any_map[key] = fr
        if fr.expires_at and fr.expires_at > now:
            if key not in fresh or fr.generated_at > fresh[key].generated_at:
                fresh[key] = fr

    def _row_to_dict(fr: ForecastResult, is_expired: bool) -> Dict:
        return {
            "algorithm": fr.algorithm.value,
            "generated_at": fr.generated_at.isoformat(),
            "expires_at": fr.expires_at.isoformat() if fr.expires_at else None,
            "accuracy_score": fr.accuracy_score,
            "period_days": fr.forecast_period_days,
            "has_forecast": True,
            "is_expired": is_expired,
        }

    overview = []
    for vm in vms:
        vid = str(vm.id)
        metrics_status: Dict[str, Optional[Dict]] = {}
        for metric in ("cpu", "ram", "disk"):
            key = (vid, metric)
            if key in fresh:
                metrics_status[metric] = _row_to_dict(fresh[key], False)
            elif key in any_map:
                metrics_status[metric] = _row_to_dict(any_map[key], True)
            else:
                metrics_status[metric] = None

        overview.append({
            "vm_id": vid,
            "hostname": vm.hostname,
            "ip_address": vm.ip_address,
            "location": vm.location,
            "cluster": vm.cluster,
            "has_prometheus": vm.prometheus_source_id is not None,
            "forecasts": metrics_status,
        })

    return overview


# ── Active scan status ────────────────────────────────────────────────────────

@router.get("/scan/active", summary="Return active scan state")
async def get_active_scan(current_user: CurrentUser):
    """Returns current scan state so clients can re-attach after reconnect."""
    return _active_scan if _active_scan.get("is_running") else {"is_running": False}


# ── Trigger batch scan ────────────────────────────────────────────────────────

@router.post("/scan", summary="Trigger batch forecast generation")
async def run_forecast_scan(
    body: ForecastScanRequest,
    db: DBSession,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
):
    """
    Start background forecast generation for all (or selected) VMs.
    Progress is broadcast via WebSocket events:
      forecast_scan_start, forecast_scan_progress, forecast_scan_complete
    Returns immediately with scan_id and total count.
    """
    if _active_scan.get("is_running"):
        raise HTTPException(status_code=409, detail="Scan sedang berjalan")

    # Validate algorithm
    try:
        algo = ForecastAlgorithm(body.algorithm)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Algorithm tidak valid: {body.algorithm}")

    # Fetch VMs (prometheus_source already eager-loaded by get_all)
    vms = await vm_service.get_all(db, limit=500)

    # Filter by explicit vm_ids if provided
    if body.vm_ids:
        vm_id_set = set(body.vm_ids)
        vms = [v for v in vms if str(v.id) in vm_id_set]

    # Only VMs with a Prometheus source can be forecast
    vms = [v for v in vms if v.prometheus_source_id is not None]

    if not vms:
        raise HTTPException(
            status_code=400,
            detail="Tidak ada VM dengan Prometheus source yang tersedia",
        )

    scan_id = uuid.uuid4().hex[:8]
    total = len(vms) * len(METRICS)

    _active_scan.clear()
    _active_scan.update({
        "is_running": True,
        "scan_id": scan_id,
        "total": total,
        "completed": 0,
        "errors": 0,
        "vm_count": len(vms),
        "algorithm": body.algorithm,
        "period_days": body.period_days,
        "started_at": datetime.now(timezone.utc).isoformat(),
    })

    background_tasks.add_task(
        _run_scan_bg,
        vms=vms,
        algo=algo,
        period_days=body.period_days,
        scan_id=scan_id,
        total=total,
    )

    return {"scan_id": scan_id, "total": total, "vm_count": len(vms)}


# ── Background scan task ──────────────────────────────────────────────────────

async def _run_scan_bg(
    vms: list,
    algo: ForecastAlgorithm,
    period_days: int,
    scan_id: str,
    total: int,
) -> None:
    """Runs forecast generation for all VMs, broadcasting WebSocket progress events."""
    completed = 0
    errors = 0

    await ws_manager.broadcast("forecast_scan_start", {
        "scan_id": scan_id,
        "total": total,
        "vm_count": len(vms),
        "algorithm": algo.value,
        "period_days": period_days,
    })

    for vm in vms:
        for metric in METRICS:
            # Broadcast "running" before starting this job
            await ws_manager.broadcast("forecast_scan_progress", {
                "scan_id": scan_id,
                "vm_id": str(vm.id),
                "hostname": vm.hostname,
                "metric": metric.value,
                "algorithm": algo.value,
                "status": "running",
                "completed": completed,
                "total": total,
            })

            try:
                await forecast_service.generate_and_save(vm, metric, algo, period_days)
                completed += 1
                status = "done"
                error_msg = None
            except Exception as exc:
                errors += 1
                completed += 1
                status = "error"
                error_msg = str(exc)[:120]
                logger.warning(
                    "scan_forecast_failed",
                    vm=vm.hostname,
                    metric=metric.value,
                    error=error_msg,
                )

            _active_scan["completed"] = completed
            _active_scan["errors"] = errors

            event_data: Dict[str, Any] = {
                "scan_id": scan_id,
                "vm_id": str(vm.id),
                "hostname": vm.hostname,
                "metric": metric.value,
                "algorithm": algo.value,
                "status": status,
                "completed": completed,
                "total": total,
            }
            if error_msg:
                event_data["error"] = error_msg

            await ws_manager.broadcast("forecast_scan_progress", event_data)

    _active_scan["is_running"] = False

    await ws_manager.broadcast("forecast_scan_complete", {
        "scan_id": scan_id,
        "completed": completed,
        "errors": errors,
        "total": total,
    })

    logger.info("forecast_scan_done", scan_id=scan_id, completed=completed, errors=errors)
