"""
WebSocket endpoint for realtime VM metrics streaming.
"""
from typing import Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.logging import get_logger
from app.websocket.manager import ws_manager

logger = get_logger(__name__)

router = APIRouter(tags=["WebSocket"])


@router.websocket("/ws")
async def websocket_global(websocket: WebSocket, token: Optional[str] = Query(default=None)):
    """
    Global WebSocket: receives ALL VM metric updates and alerts.
    Authenticate by passing ?token=<access_token> in the URL.
    """
    # TODO: validate token in production
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive; clients send pings as plain text
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text('{"event":"pong","data":null}')
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
        logger.info("ws_global_disconnected")


@router.websocket("/ws/vm/{vm_id}")
async def websocket_vm(
    websocket: WebSocket,
    vm_id: str,
    token: Optional[str] = Query(default=None),
):
    """
    Per-VM WebSocket: receives metric updates only for the given VM.
    """
    await ws_manager.connect(websocket, vm_id=vm_id)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text('{"event":"pong","data":null}')
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, vm_id=vm_id)
        logger.info("ws_vm_disconnected", vm_id=vm_id)
