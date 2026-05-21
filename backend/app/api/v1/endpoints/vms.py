"""
VM endpoints: CRUD + metrics + history + forecast.
"""
import json
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import AdminOnly, CurrentUser, DBSession
from app.core.logging import get_logger
from app.forecasting.service import forecast_service

logger = get_logger(__name__)
from app.models.models import ForecastAlgorithm, ForecastMetric
from app.schemas.schemas import (
    DashboardSummary,
    ForecastHistoryItem,
    ForecastResponse,
    VMCreate,
    VMHistoryResponse,
    VMListResponse,
    VMMetrics,
    VMResponse,
    VMUpdate,
)
from app.forecasting.storage import list_forecast_history
from app.services.vm_service import vm_service

router = APIRouter(prefix="/vms", tags=["Virtual Machines"])


@router.get("", response_model=VMListResponse, summary="List all VMs")
async def list_vms(
    db: DBSession,
    current_user: CurrentUser,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
):
    total = await vm_service.count_all(db)
    vms = await vm_service.get_all(db, skip=skip, limit=limit)
    return VMListResponse(total=total, vms=[VMResponse.model_validate(v) for v in vms])


@router.post("", response_model=VMResponse, status_code=status.HTTP_201_CREATED,
             summary="Register a new VM", dependencies=[AdminOnly])
async def create_vm(body: VMCreate, db: DBSession, current_user: CurrentUser):
    vm = await vm_service.create(db, body)
    return VMResponse.model_validate(vm)


@router.get("/summary", response_model=DashboardSummary, summary="Dashboard summary stats")
async def get_dashboard_summary(db: DBSession, current_user: CurrentUser):
    return await vm_service.get_dashboard_summary(db)


@router.get("/{vm_id}", response_model=VMResponse, summary="Get VM details")
async def get_vm(vm_id: uuid.UUID, db: DBSession, current_user: CurrentUser):
    vm = await vm_service.get_by_id(db, vm_id)
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")
    return VMResponse.model_validate(vm)


@router.patch("/{vm_id}", response_model=VMResponse, summary="Update VM metadata",
              dependencies=[AdminOnly])
async def update_vm(vm_id: uuid.UUID, body: VMUpdate, db: DBSession, current_user: CurrentUser):
    vm = await vm_service.get_by_id(db, vm_id)
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")
    updated = await vm_service.update(db, vm, body)
    return VMResponse.model_validate(updated)


@router.delete("/{vm_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Deregister VM",
               dependencies=[AdminOnly])
async def delete_vm(vm_id: uuid.UUID, db: DBSession, current_user: CurrentUser):
    vm = await vm_service.get_by_id(db, vm_id)
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")
    await vm_service.delete(db, vm)


@router.get("/{vm_id}/metrics", response_model=VMMetrics, summary="Get current VM metrics")
async def get_vm_metrics(vm_id: uuid.UUID, db: DBSession, current_user: CurrentUser):
    vm = await vm_service.get_by_id(db, vm_id)
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")
    return await vm_service.collect_metrics(db, vm)


@router.get("/{vm_id}/history", response_model=VMHistoryResponse, summary="Get metric history")
async def get_vm_history(
    vm_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser,
    metric: str = Query(default="cpu", regex="^(cpu|ram|disk|network_rx|network_tx|load)$"),
    hours: int = Query(default=24, ge=1, le=720),
    step: str = Query(default="5m"),
):
    vm = await vm_service.get_by_id(db, vm_id)
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")
    return await vm_service.get_history(vm, metric, hours, step)


@router.get("/{vm_id}/forecast", response_model=ForecastResponse, summary="Get forecast (cache atau generate)")
async def get_vm_forecast(
    vm_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser,
    metric: ForecastMetric = Query(default=ForecastMetric.CPU),
    algorithm: ForecastAlgorithm = Query(default=ForecastAlgorithm.AUTO),
    period_days: int = Query(default=7, ge=1, le=90),
    force_refresh: bool = Query(default=False, description="Paksa generate ulang dari Prometheus"),
):
    vm = await vm_service.get_by_id(db, vm_id)
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")
    return await forecast_service.get_cached_or_generate(
        db, vm, metric, algorithm, period_days, force_refresh=force_refresh
    )


@router.post(
    "/{vm_id}/forecast/generate",
    response_model=ForecastResponse,
    summary="Generate & simpan forecast untuk VM terpilih",
)
async def generate_vm_forecast(
    vm_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser,
    metric: ForecastMetric = Query(default=ForecastMetric.CPU),
    algorithm: ForecastAlgorithm = Query(default=ForecastAlgorithm.AUTO),
    period_days: int = Query(default=7, ge=1, le=90),
):
    vm = await vm_service.get_by_id(db, vm_id)
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")
    try:
        return await forecast_service.generate_and_save(db, vm, metric, algorithm, period_days)
    except Exception as exc:
        logger.exception("forecast_generate_failed", vm_id=str(vm_id))
        raise HTTPException(
            status_code=500,
            detail=f"Gagal menghitung forecast: {exc}",
        ) from exc


@router.get(
    "/{vm_id}/forecast/history",
    response_model=list[ForecastHistoryItem],
    summary="Riwayat forecast tersimpan untuk VM",
)
async def get_vm_forecast_history(
    vm_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser,
    limit: int = Query(default=20, ge=1, le=100),
):
    vm = await vm_service.get_by_id(db, vm_id)
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")
    rows = await list_forecast_history(db, vm_id, limit=limit)
    return [
        ForecastHistoryItem(
            id=r.id,
            vm_id=r.vm_id,
            metric=r.metric,
            algorithm=r.algorithm,
            forecast_period_days=r.forecast_period_days,
            accuracy_score=r.accuracy_score,
            generated_at=r.generated_at,
            has_forecast=len(json.loads(r.forecast_data).get("forecast", [])) > 0,
        )
        for r in rows
    ]
