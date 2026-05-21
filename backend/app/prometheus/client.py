"""
Prometheus HTTP API client service.
Provides typed, async access to PromQL queries.
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# ─── Metric query constants ────────────────────────────────────────────────────

QUERIES = {
    "cpu_usage": (
        '100 - (avg by (instance) (rate(node_cpu_seconds_total{{instance="{instance}",mode="idle"}}[5m])) * 100)'
    ),
    "ram_usage_percent": (
        '100 - ((node_memory_MemAvailable_bytes{{instance="{instance}"}} / '
        'node_memory_MemTotal_bytes{{instance="{instance}"}}) * 100)'
    ),
    "ram_total_bytes": 'node_memory_MemTotal_bytes{{instance="{instance}"}}',
    "ram_available_bytes": 'node_memory_MemAvailable_bytes{{instance="{instance}"}}',
    "disk_usage_percent": (
        '100 - ((node_filesystem_avail_bytes{{instance="{instance}",mountpoint="/",fstype!="tmpfs"}} / '
        'node_filesystem_size_bytes{{instance="{instance}",mountpoint="/",fstype!="tmpfs"}}) * 100)'
    ),
    "disk_total_bytes": (
        'node_filesystem_size_bytes{{instance="{instance}",mountpoint="/",fstype!="tmpfs"}}'
    ),
    "disk_avail_bytes": (
        'node_filesystem_avail_bytes{{instance="{instance}",mountpoint="/",fstype!="tmpfs"}}'
    ),
    "network_rx_bytes": (
        'rate(node_network_receive_bytes_total{{instance="{instance}",device!="lo"}}[5m])'
    ),
    "network_tx_bytes": (
        'rate(node_network_transmit_bytes_total{{instance="{instance}",device!="lo"}}[5m])'
    ),
    "uptime_seconds": 'node_time_seconds{{instance="{instance}"}} - node_boot_time_seconds{{instance="{instance}"}}',
    "load_avg_1m": 'node_load1{{instance="{instance}"}}',
    "load_avg_5m": 'node_load5{{instance="{instance}"}}',
    "load_avg_15m": 'node_load15{{instance="{instance}"}}',
    # Instance up/down
    "up": 'up{{instance="{instance}", job="{job}"}}',
}


class PrometheusService:
    """Async Prometheus HTTP API wrapper with dynamic client pooling."""

    def __init__(self) -> None:
        self._clients: Dict[str, httpx.AsyncClient] = {}

    def get_client(self, url: str) -> httpx.AsyncClient:
        if not url:
            raise ValueError("Prometheus URL wajib disediakan dari database (Prometheus Sources)")
        base_url = url
        if base_url not in self._clients or self._clients[base_url].is_closed:
            self._clients[base_url] = httpx.AsyncClient(
                base_url=base_url,
                timeout=settings.PROMETHEUS_TIMEOUT,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        return self._clients[base_url]

    async def close(self) -> None:
        for client in self._clients.values():
            if not client.is_closed:
                await client.aclose()
        self._clients.clear()

    # ─── Raw query helpers ─────────────────────────────────────────────────────

    async def query(
        self,
        promql: str,
        url: str,
        time_: Optional[datetime] = None,
    ) -> List[Dict[str, Any]]:
        """Instant query against Prometheus."""
        params: Dict[str, Any] = {"query": promql}
        if time_:
            params["time"] = time_.timestamp()
        try:
            resp = await self.get_client(url).get("/api/v1/query", params=params)
            resp.raise_for_status()
            data = resp.json()
            if data["status"] != "success":
                logger.warning("prometheus_query_failed", query=promql, error=data.get("error"))
                return []
            return data["data"]["result"]
        except httpx.HTTPError as exc:
            logger.error("prometheus_http_error", query=promql, error=str(exc))
            return []

    async def query_range(
        self,
        promql: str,
        start: datetime,
        end: datetime,
        url: str,
        step: str = "1m",
    ) -> List[Dict[str, Any]]:
        """Range query against Prometheus."""
        params = {
            "query": promql,
            "start": start.timestamp(),
            "end": end.timestamp(),
            "step": step,
        }
        try:
            resp = await self.get_client(url).get("/api/v1/query_range", params=params)
            resp.raise_for_status()
            data = resp.json()
            if data["status"] != "success":
                logger.warning("prometheus_range_failed", query=promql, error=data.get("error"))
                return []
            return data["data"]["result"]
        except httpx.HTTPError as exc:
            logger.error("prometheus_range_http_error", query=promql, error=str(exc))
            return []

    # ─── Typed helpers ─────────────────────────────────────────────────────────

    def _extract_value(self, result: List[Dict]) -> Optional[float]:
        if not result:
            return None
        try:
            raw = result[0]["value"][1]
            val = float(raw)
            return round(val, 4)
        except (KeyError, IndexError, ValueError):
            return None

    def _extract_sum(self, result: List[Dict]) -> Optional[float]:
        """Sum across multiple time series (e.g., network interfaces)."""
        if not result:
            return None
        try:
            total = sum(float(r["value"][1]) for r in result)
            return round(total, 4)
        except (KeyError, ValueError):
            return None

    def _extract_range(self, result: List[Dict]) -> List[Tuple[datetime, float]]:
        if not result:
            return []
        try:
            return [
                (datetime.fromtimestamp(float(ts), tz=timezone.utc), round(float(val), 4))
                for ts, val in result[0]["values"]
            ]
        except (KeyError, IndexError, ValueError):
            return []

    def _extract_range_sum(self, result: List[Dict]) -> List[Tuple[datetime, float]]:
        """Aggregate multiple series by summing at each timestamp."""
        if not result:
            return []
        aggregated: Dict[float, float] = {}
        for series in result:
            for ts, val in series.get("values", []):
                aggregated[float(ts)] = aggregated.get(float(ts), 0.0) + float(val)
        return [
            (datetime.fromtimestamp(ts, tz=timezone.utc), round(v, 4))
            for ts, v in sorted(aggregated.items())
        ]

    # ─── Public API ───────────────────────────────────────────────────────────

    async def is_healthy(self, url: str) -> bool:
        try:
            resp = await self.get_client(url).get("/-/healthy", timeout=5)
            return resp.status_code == 200
        except Exception:
            return False

    async def get_instance_up(self, instance: str, job: str, url: str) -> bool:
        q = QUERIES["up"].format(instance=instance, job=job)
        result = await self.query(q, url=url)
        val = self._extract_value(result)
        return val is not None and val == 1.0

    async def get_current_metrics(self, instance: str, url: str) -> Dict[str, Optional[float]]:
        """Fetch all current metric values for one VM instance."""
        import asyncio

        async def _q(key: str, **fmt: str) -> Tuple[str, Optional[float]]:
            promql = QUERIES[key].format(instance=instance, **fmt)
            result = await self.query(promql, url=url)
            if key in ("network_rx_bytes", "network_tx_bytes"):
                return key, self._extract_sum(result)
            return key, self._extract_value(result)

        tasks = [
            _q("cpu_usage"),
            _q("ram_usage_percent"),
            _q("ram_total_bytes"),
            _q("ram_available_bytes"),
            _q("disk_usage_percent"),
            _q("disk_total_bytes"),
            _q("disk_avail_bytes"),
            _q("network_rx_bytes"),
            _q("network_tx_bytes"),
            _q("uptime_seconds"),
            _q("load_avg_1m"),
            _q("load_avg_5m"),
            _q("load_avg_15m"),
        ]
        results = await asyncio.gather(*tasks)
        return dict(results)

    async def get_metric_range(
        self,
        instance: str,
        metric_key: str,
        url: str,
        hours: int = 24,
        step: str = "5m",
        aggregate: bool = False,
    ) -> List[Tuple[datetime, float]]:
        """Get historical range for a metric."""
        end = datetime.now(timezone.utc)
        start = end - timedelta(hours=hours)
        promql = QUERIES[metric_key].format(instance=instance)
        result = await self.query_range(promql, start, end, url, step=step)
        if aggregate:
            return self._extract_range_sum(result)
        return self._extract_range(result)

    async def get_retention_days(self, url: str) -> int:
        """Fetch Prometheus storage retention time in days, defaulting to 15 if not found or on error."""
        try:
            resp = await self.get_client(url).get("/api/v1/status/flags")
            if resp.status_code == 200:
                data = resp.json()
                if data.get("status") == "success":
                    flags = data.get("data", {})
                    retention_str = flags.get("storage.tsdb.retention.time") or flags.get("storage.tsdb.retention")
                    if retention_str:
                        import re
                        match = re.match(r"^(\d+)([a-zA-Z]+)$", retention_str.strip())
                        if match:
                            val = int(match.group(1))
                            unit = match.group(2).lower()
                            if unit == "d":
                                return val
                            elif unit == "w":
                                return val * 7
                            elif unit == "y":
                                return val * 365
                            elif unit == "h":
                                return max(1, val // 24)
                            elif unit == "m":
                                return max(1, val // 1440)
        except Exception as exc:
            logger.error("prometheus_get_retention_error", error=str(exc))
        return 15  # Fallback default retention is 15d in Prometheus

    async def list_targets(self, url: str) -> List[Dict[str, Any]]:
        """Return all active scrape targets from Prometheus."""
        try:
            resp = await self.get_client(url).get("/api/v1/targets")
            resp.raise_for_status()
            data = resp.json()
            return data.get("data", {}).get("activeTargets", [])
        except Exception as exc:
            logger.error("prometheus_list_targets_error", error=str(exc))
            return []



# Singleton
prometheus_service = PrometheusService()
