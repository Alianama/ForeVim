"""
Holt / Holt-Winters ringan berbasis NumPy (fallback jika statsmodels gagal).
"""
from __future__ import annotations

from typing import List, Optional, Tuple

import numpy as np


def holt_forecast(
    values: np.ndarray,
    periods: int,
    seasonal_period: Optional[int] = None,
    *,
    alpha: float = 0.35,
    beta: float = 0.12,
    gamma: float = 0.15,
) -> Tuple[np.ndarray, np.ndarray, float]:
    """
    Returns (in_sample_fitted, future_forecast, residual_std).
    """
    n = len(values)
    if n < 4:
        return np.array([]), np.array([]), 0.0

    if seasonal_period and n >= 2 * seasonal_period:
        return _holt_winters_additive(values, periods, seasonal_period, alpha, beta, gamma)

    return _holt_double(values, periods, alpha, beta)


def _holt_double(
    values: np.ndarray,
    periods: int,
    alpha: float,
    beta: float,
) -> Tuple[np.ndarray, np.ndarray, float]:
    n = len(values)
    level = float(values[0])
    trend = float(values[1] - values[0]) if n > 1 else 0.0
    fitted = np.zeros(n)

    for t in range(n):
        fitted[t] = level + trend
        prev_level = level
        level = alpha * values[t] + (1 - alpha) * (level + trend)
        trend = beta * (level - prev_level) + (1 - beta) * trend

    future = np.array([level + h * trend for h in range(1, periods + 1)])
    residuals = values - fitted
    residual_std = float(np.std(residuals)) if n > 1 else 0.0
    return fitted, future, residual_std


def _holt_winters_additive(
    values: np.ndarray,
    periods: int,
    seasonal_period: int,
    alpha: float,
    beta: float,
    gamma: float,
) -> Tuple[np.ndarray, np.ndarray, float]:
    n = len(values)
    sp = seasonal_period
    seasonals = np.zeros(sp)
    for i in range(sp):
        seasonals[i] = float(np.mean(values[i::sp]))

    level = float(values[0] - seasonals[0 % sp])
    trend = float((values[sp] - seasonals[sp % sp]) - (values[0] - seasonals[0])) / sp if n > sp else 0.0
    fitted = np.zeros(n)

    for t in range(n):
        s_idx = t % sp
        fitted[t] = level + trend + seasonals[s_idx]
        val = values[t]
        prev_level = level
        level = alpha * (val - seasonals[s_idx]) + (1 - alpha) * (level + trend)
        trend = beta * (level - prev_level) + (1 - beta) * trend
        seasonals[s_idx] = gamma * (val - level) + (1 - gamma) * seasonals[s_idx]

    future = np.zeros(periods)
    for h in range(1, periods + 1):
        s_idx = (n + h - 1) % sp
        future[h - 1] = level + h * trend + seasonals[s_idx]

    residuals = values - fitted
    residual_std = float(np.std(residuals)) if n > 1 else 0.0
    return fitted, future, residual_std
