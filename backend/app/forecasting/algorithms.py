"""
Forecasting module: pluggable algorithm architecture.
Current implementations: Moving Average, Linear Regression.
Architecture supports: Prophet, ARIMA, LSTM (future).
"""
from __future__ import annotations

import json
import math
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from app.core.logging import get_logger
from app.models.models import ForecastAlgorithm, ForecastMetric
from app.schemas.schemas import ForecastPoint

logger = get_logger(__name__)


# ─── Base Algorithm ───────────────────────────────────────────────────────────


class ForecastAlgorithmBase(ABC):
    """Abstract base class for all forecasting algorithms."""

    name: ForecastAlgorithm

    @abstractmethod
    def fit_predict(
        self,
        historical: List[Tuple[datetime, float]],
        periods: int,
        interval_minutes: int = 5,
    ) -> Tuple[List[ForecastPoint], Optional[float]]:
        """
        Fit on historical data and return forecast points.

        Args:
            historical: List of (timestamp, value) tuples sorted ascending.
            periods: Number of intervals to forecast.
            interval_minutes: Minutes between forecast points.

        Returns:
            (forecast_points, accuracy_score)
        """
        raise NotImplementedError

    def _build_historical_points(
        self, historical: List[Tuple[datetime, float]]
    ) -> List[ForecastPoint]:
        return [
            ForecastPoint(timestamp=ts, value=val, is_forecast=False)
            for ts, val in historical
        ]

    def _calc_mae(
        self, actual: List[float], predicted: List[float]
    ) -> Optional[float]:
        if len(actual) != len(predicted) or not actual:
            return None
        errors = [abs(a - p) for a, p in zip(actual, predicted)]
        return round(sum(errors) / len(errors), 4)


# ─── Moving Average ───────────────────────────────────────────────────────────


class MovingAverageForecaster(ForecastAlgorithmBase):
    """Simple Moving Average with configurable window."""

    name = ForecastAlgorithm.MOVING_AVERAGE

    def __init__(self, window: int = 12) -> None:
        self.window = window

    def fit_predict(
        self,
        historical: List[Tuple[datetime, float]],
        periods: int,
        interval_minutes: int = 5,
    ) -> Tuple[List[ForecastPoint], Optional[float]]:
        if len(historical) < self.window:
            logger.warning("insufficient_data_for_ma", count=len(historical), window=self.window)
            return [], None

        values = [v for _, v in historical]

        # Validate holdout to compute accuracy
        holdout = min(self.window, len(values) // 5)
        train_vals = values[: len(values) - holdout]
        test_vals = values[len(values) - holdout :]

        predicted_test: List[float] = []
        current = list(train_vals[-self.window :])
        for _ in test_vals:
            pred = sum(current[-self.window :]) / min(self.window, len(current))
            predicted_test.append(pred)
            current.append(pred)

        accuracy = self._calc_mae(test_vals, predicted_test)

        # Forecast future periods
        last_ts = historical[-1][0]
        rolling = list(values[-self.window :])
        forecast_points: List[ForecastPoint] = []

        for i in range(1, periods + 1):
            pred_val = sum(rolling[-self.window :]) / min(self.window, len(rolling))
            std = float(np.std(rolling[-self.window :]))
            forecast_points.append(
                ForecastPoint(
                    timestamp=last_ts + timedelta(minutes=interval_minutes * i),
                    value=round(max(0.0, min(100.0, pred_val)), 4),
                    lower_bound=round(max(0.0, pred_val - 1.5 * std), 4),
                    upper_bound=round(min(100.0, pred_val + 1.5 * std), 4),
                    is_forecast=True,
                )
            )
            rolling.append(pred_val)

        return forecast_points, accuracy


# ─── Linear Regression ────────────────────────────────────────────────────────


class LinearRegressionForecaster(ForecastAlgorithmBase):
    """Ordinary Least Squares linear regression over time index."""

    name = ForecastAlgorithm.LINEAR_REGRESSION

    def fit_predict(
        self,
        historical: List[Tuple[datetime, float]],
        periods: int,
        interval_minutes: int = 5,
    ) -> Tuple[List[ForecastPoint], Optional[float]]:
        if len(historical) < 4:
            return [], None

        timestamps = np.array(
            [ts.timestamp() for ts, _ in historical], dtype=np.float64
        )
        values = np.array([v for _, v in historical], dtype=np.float64)

        # Normalize timestamps
        t0 = timestamps[0]
        x = timestamps - t0

        # OLS
        n = len(x)
        x_mean, y_mean = x.mean(), values.mean()
        ss_xy = float(np.sum((x - x_mean) * (values - y_mean)))
        ss_xx = float(np.sum((x - x_mean) ** 2))

        if ss_xx == 0:
            slope = 0.0
        else:
            slope = ss_xy / ss_xx
        intercept = y_mean - slope * x_mean

        # Accuracy on training data (R²)
        predicted = slope * x + intercept
        ss_res = float(np.sum((values - predicted) ** 2))
        ss_tot = float(np.sum((values - y_mean) ** 2))
        r2 = 1.0 - (ss_res / ss_tot) if ss_tot > 0 else 0.0

        # Residual std for confidence intervals
        residuals = values - predicted
        residual_std = float(np.std(residuals))

        last_ts = historical[-1][0]
        interval_secs = interval_minutes * 60
        forecast_points: List[ForecastPoint] = []

        for i in range(1, periods + 1):
            future_x = (last_ts.timestamp() - t0) + interval_secs * i
            pred_val = slope * future_x + intercept
            forecast_points.append(
                ForecastPoint(
                    timestamp=last_ts + timedelta(minutes=interval_minutes * i),
                    value=round(max(0.0, min(100.0, pred_val)), 4),
                    lower_bound=round(max(0.0, pred_val - 2 * residual_std), 4),
                    upper_bound=round(min(100.0, pred_val + 2 * residual_std), 4),
                    is_forecast=True,
                )
            )

        return forecast_points, round(r2, 4)


# ─── Stub stubs for future algorithms ─────────────────────────────────────────


class ProphetForecaster(ForecastAlgorithmBase):
    """Placeholder for Facebook Prophet integration."""

    name = ForecastAlgorithm.PROPHET

    def fit_predict(self, historical, periods, interval_minutes=5):
        raise NotImplementedError("Prophet not yet integrated. Install prophet>=1.1 first.")


class ARIMAForecaster(ForecastAlgorithmBase):
    """Placeholder for ARIMA/statsmodels integration."""

    name = ForecastAlgorithm.ARIMA

    def fit_predict(self, historical, periods, interval_minutes=5):
        raise NotImplementedError("ARIMA not yet integrated. Install statsmodels first.")


class LSTMForecaster(ForecastAlgorithmBase):
    """Placeholder for LSTM (PyTorch/TF) integration."""

    name = ForecastAlgorithm.LSTM

    def fit_predict(self, historical, periods, interval_minutes=5):
        raise NotImplementedError("LSTM not yet integrated.")


# ─── Registry ─────────────────────────────────────────────────────────────────


_REGISTRY: Dict[ForecastAlgorithm, ForecastAlgorithmBase] = {
    ForecastAlgorithm.MOVING_AVERAGE: MovingAverageForecaster(),
    ForecastAlgorithm.LINEAR_REGRESSION: LinearRegressionForecaster(),
    ForecastAlgorithm.PROPHET: ProphetForecaster(),
    ForecastAlgorithm.ARIMA: ARIMAForecaster(),
    ForecastAlgorithm.LSTM: LSTMForecaster(),
}


def get_forecaster(algorithm: ForecastAlgorithm) -> ForecastAlgorithmBase:
    if algorithm not in _REGISTRY:
        raise ValueError(f"Unknown algorithm: {algorithm}")
    return _REGISTRY[algorithm]
