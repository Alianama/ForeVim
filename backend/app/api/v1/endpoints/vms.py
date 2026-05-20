"""
VM endpoints: CRUD + metrics + history + forecast.
"""
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import AdminOnly, CurrentUser, DBSession
from app.forecasting.service import forecast_service
from app.models.models import ForecastAlgorithm, ForecastMetric
from app.schemas.schemas import (
    DashboardSummary,
    ForecastResponse,
    VMCreate,
    VMHistoryResponse,
    VMListResponse,
    VMMetrics,
    VMResponse,
    VMUpdate,
)
from app.services.vm_service import vm_service

router = APIRouter(prefix="/vms", tags=["Virtual Machines"])


@router.get("", response_model=VMListResponse, summary="List all VMs")
async def list_vms(
    db: DBSession,
    current_user: CurrentUser,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
):
    vms = await vm_service.get_all(db, skip=skip, limit=limit)
    return VMListResponse(total=len(vms), vms=[VMResponse.model_validate(v) for v in vms])


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


@router.get("/{vm_id}/forecast", response_model=ForecastResponse, summary="Get metric forecast")
async def get_vm_forecast(
    vm_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser,
    metric: ForecastMetric = Query(default=ForecastMetric.CPU),
    algorithm: ForecastAlgorithm = Query(default=ForecastAlgorithm.LINEAR_REGRESSION),
    period_days: int = Query(default=7, ge=1, le=365),
):
    vm = await vm_service.get_by_id(db, vm_id)
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")
    instance = vm.prometheus_instance or f"{vm.ip_address}:9100"
    return await forecast_service.generate_forecast(
        vm_id=vm.id,
        instance=instance,
        metric=metric,
        algorithm=algorithm,
        period_days=period_days,
    )
