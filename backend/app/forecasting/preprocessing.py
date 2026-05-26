"""
Time-series preprocessing for infrastructure metrics (best practices).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List, Tuple

import numpy as np

# Max gap (in intervals) to forward-fill; larger gaps stay as missing then interpolated
MAX_FILL_GAP_INTERVALS = 3
OUTLIER_PERCENTILE = (1.0, 99.0)


def preprocess_timeseries(
    historical: List[Tuple[datetime, float]],
    interval_minutes: int,
    *,
    value_min: float = 0.0,
    value_max: float = 100.0,
    min_points: int = 12,
) -> List[Tuple[datetime, float]]:
    """
    1. Sort & dedupe timestamps (mean duplicates)
    2. Resample to regular grid
    3. Forward-fill short gaps
    4. Linear interpolate remaining NaNs
    5. Winsorize outliers
    6. Clip to valid metric range
    """
    if not historical:
        return []

    sorted_hist = sorted(historical, key=lambda x: x[0])
    bucket_seconds = interval_minutes * 60

    buckets: dict[int, list[float]] = {}
    for ts, val in sorted_hist:
        if val is None or np.isnan(val) or np.isinf(val):
            continue
        key = int(ts.timestamp() // bucket_seconds)
        buckets.setdefault(key, []).append(float(val))

    if not buckets:
        return []

    keys = sorted(buckets.keys())
    start_key, end_key = keys[0], keys[-1]

    series: list[tuple[int, float | None]] = []
    for k in range(start_key, end_key + 1):
        if k in buckets:
            series.append((k, float(np.mean(buckets[k]))))
        else:
            series.append((k, None))

    # Forward-fill short gaps
    filled: list[tuple[int, float | None]] = []
    last_val: float | None = None
    gap_count = 0
    for k, v in series:
        if v is not None:
            filled.append((k, v))
            last_val = v
            gap_count = 0
        else:
            gap_count += 1
            if last_val is not None and gap_count <= MAX_FILL_GAP_INTERVALS:
                filled.append((k, last_val))
            else:
                filled.append((k, None))

    # Linear interpolation for remaining holes
    keys_only = [k for k, v in filled]
    vals = [v for k, v in filled]
    n = len(vals)
    for i in range(n):
        if vals[i] is not None:
            continue
        left = next((j for j in range(i - 1, -1, -1) if vals[j] is not None), None)
        right = next((j for j in range(i + 1, n) if vals[j] is not None), None)
        if left is not None and right is not None:
            t = (i - left) / (right - left)
            vals[i] = vals[left] + t * (vals[right] - vals[left])
        elif left is not None:
            vals[i] = vals[left]
        elif right is not None:
            vals[i] = vals[right]

    arr = np.array([v if v is not None else np.nan for v in vals], dtype=np.float64)
    valid = arr[~np.isnan(arr)]
    if len(valid) >= 4:
        lo, hi = np.percentile(valid, OUTLIER_PERCENTILE)
        arr = np.clip(arr, lo, hi)

    arr = np.nan_to_num(arr, nan=float(np.nanmean(arr)) if len(valid) else 0.0)
    arr = np.clip(arr, value_min, value_max)

    result: List[Tuple[datetime, float]] = []
    for k, v in zip(keys_only, arr):
        result.append(
            (
                datetime.fromtimestamp(k * bucket_seconds, tz=timezone.utc),
                round(float(v), 4),
            )
        )

    if len(result) < min_points:
        return result
    return result


def downsample_for_display(
    points: List[Tuple[datetime, float]],
    max_points: int = 400,
) -> List[Tuple[datetime, float]]:
    """Reduce points for API/chart payload without affecting model fit."""
    if len(points) <= max_points:
        return points
    step = max(1, len(points) // max_points)
    return [points[i] for i in range(0, len(points), step)]


def required_lookback_hours(
    period_days: int,
    interval_minutes: int,
    *,
    min_hours: int = 48,
    max_hours: int = 2160,
) -> int:
    """At least 2 daily seasons + forecast horizon, capped for Prometheus retention."""
    daily_points = max(1, int(1440 / interval_minutes))
    min_for_season = 2 * daily_points * interval_minutes / 60
    horizon = period_days * 24
    hours = int(max(min_hours, min_for_season, horizon * 1.5))
    return min(hours, max_hours)
