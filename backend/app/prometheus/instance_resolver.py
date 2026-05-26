"""
Resolve Prometheus `instance` label untuk query range (sering beda dengan yang di DB).
"""
from __future__ import annotations

import re
from typing import List, Optional, Tuple

from datetime import datetime

from app.prometheus.client import QUERIES, prometheus_service

# Query dengan regex IP — jika exact instance tidak ada data
QUERIES_BY_IP = {
    "cpu_usage": (
        '100 - (avg by (instance) (rate(node_cpu_seconds_total{{instance=~"{ip_regex}",mode="idle"}}[5m])) * 100)'
    ),
    "ram_usage_percent": (
        '100 - ((node_memory_MemAvailable_bytes{{instance=~"{ip_regex}"}} / '
        'node_memory_MemTotal_bytes{{instance=~"{ip_regex}"}}) * 100)'
    ),
    "disk_usage_percent": (
        'max by (instance) (100 - ((node_filesystem_avail_bytes{{instance=~"{ip_regex}",fstype!~"tmpfs|devtmpfs|squashfs|overlay|aufs"}} / '
        'node_filesystem_size_bytes{{instance=~"{ip_regex}",fstype!~"tmpfs|devtmpfs|squashfs|overlay|aufs"}}) * 100))'
    ),
}


def _instance_candidates(ip_address: str, prometheus_instance: Optional[str]) -> List[str]:
    seen: set[str] = set()
    out: List[str] = []
    for c in [
        prometheus_instance,
        f"{ip_address}:9100",
        f"{ip_address}:9101",
        ip_address,
    ]:
        if c and c not in seen:
            seen.add(c)
            out.append(c)
    return out


def _ip_regex(ip_address: str) -> str:
    escaped = re.escape(ip_address)
    return f"{escaped}(:910[0-9]+)?"


async def fetch_metric_history(
    *,
    ip_address: str,
    prometheus_instance: Optional[str],
    metric_key: str,
    url: str,
    hours: int,
    step: str,
    aggregate: bool,
    min_points: int = 12,
) -> Tuple[List[Tuple[datetime, float]], Optional[str]]:
    """
    Coba beberapa label instance; fallback ke query regex berdasarkan IP.
    Returns (data, resolved_instance).
    """
    from datetime import timedelta, timezone

    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=hours)

    for inst in _instance_candidates(ip_address, prometheus_instance):
        promql = QUERIES[metric_key].format(instance=inst)
        result = await prometheus_service.query_range(promql, start, end, url, step=step)
        if aggregate:
            data = prometheus_service._extract_range_sum(result)
        else:
            data = prometheus_service._extract_range(result)
        if len(data) >= min_points:
            return data, inst

    if metric_key in QUERIES_BY_IP:
        ip_regex = _ip_regex(ip_address)
        promql = QUERIES_BY_IP[metric_key].format(ip_regex=ip_regex)
        result = await prometheus_service.query_range(promql, start, end, url, step=step)
        data = (
            prometheus_service._extract_range_sum(result)
            if aggregate
            else prometheus_service._extract_range(result)
        )
        if len(data) >= min_points:
            return data, prometheus_instance or f"{ip_address}:9100"

    return [], prometheus_instance
