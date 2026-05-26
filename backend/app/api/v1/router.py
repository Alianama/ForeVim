"""
API v1 router aggregation.
"""
from fastapi import APIRouter

from app.api.v1.endpoints import auth, vms, alerts, websocket, prometheus_sync, users, ssh, forecasts

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(vms.router)
api_router.include_router(forecasts.router)
api_router.include_router(alerts.router)
api_router.include_router(websocket.router)
api_router.include_router(prometheus_sync.router)
api_router.include_router(users.router)
api_router.include_router(ssh.router)
