"""
WebSocket connection manager.
Handles broadcast to all connected clients and per-VM subscriptions.
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Set
import uuid

from fastapi import WebSocket, WebSocketDisconnect
from app.core.logging import get_logger

logger = get_logger(__name__)


class ConnectionManager:
    """Manages active WebSocket connections."""

    def __init__(self) -> None:
        # All connected clients
        self._connections: Set[WebSocket] = set()
        # Per-VM subscribers: vm_id -> set of websockets
        self._vm_subscribers: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, vm_id: Optional[str] = None) -> None:
        await websocket.accept()
        self._connections.add(websocket)
        if vm_id:
            self._vm_subscribers.setdefault(vm_id, set()).add(websocket)
        logger.info("ws_connected", total=len(self._connections), vm_id=vm_id)

    def disconnect(self, websocket: WebSocket, vm_id: Optional[str] = None) -> None:
        self._connections.discard(websocket)
        if vm_id and vm_id in self._vm_subscribers:
            self._vm_subscribers[vm_id].discard(websocket)
        logger.info("ws_disconnected", total=len(self._connections), vm_id=vm_id)

    async def broadcast(self, event: str, data: Any) -> None:
        """Send to ALL connected clients."""
        payload = json.dumps(
            {"event": event, "data": data, "timestamp": datetime.now(timezone.utc).isoformat()}
        )
        dead: list = []
        for ws in list(self._connections):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._connections.discard(ws)

    async def send_to_vm_subscribers(
        self, vm_id: str, event: str, data: Any
    ) -> None:
        """Send to clients subscribed to a specific VM."""
        payload = json.dumps(
            {"event": event, "data": data, "timestamp": datetime.now(timezone.utc).isoformat()}
        )
        subs = self._vm_subscribers.get(vm_id, set())
        dead: list = []
        for ws in list(subs):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            subs.discard(ws)

    async def send_personal(self, websocket: WebSocket, event: str, data: Any) -> None:
        payload = json.dumps(
            {"event": event, "data": data, "timestamp": datetime.now(timezone.utc).isoformat()}
        )
        try:
            await websocket.send_text(payload)
        except Exception as exc:
            logger.warning("ws_personal_send_failed", error=str(exc))

    @property
    def connection_count(self) -> int:
        return len(self._connections)


ws_manager = ConnectionManager()
