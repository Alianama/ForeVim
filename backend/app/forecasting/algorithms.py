"""
Forecasting algorithms for VM resource metrics.

Recommended for production: Holt-Winters (seasonal workloads) or Auto (model selection).
Baselines: Moving Average, Linear Regression.
Advanced: SARIMA (ARIMA with seasonality).
"""
from __future__ import annotations

import warnings
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

import numpy as np

from app.core.logging import get_logger
from app.forecasting.holt_native import holt_forecast
from app.forecasting.preprocessing import preprocess_timeseries
from app.models.models import ForecastAlgorithm
from app.schemas.schemas import ForecastPoint

logger = get_logger(__name__)

warnings.filterwarnings("ignore", category=UserWarning, module="statsmodels")
warnings.filterwarnings("ignore", category=FutureWarning, module="statsmodels")
warnings.filterwarnings("ignore", message="Maximum Likelihood optimization failed to converge.*")


# statsmodels 0.14.4 + numpy 2.2 dapat gagal saat import ExponentialSmoothing
_ExponentialSmoothing = None
try:
    from statsmodels.tsa.holtwinters import ExponentialSmoothing as _ExponentialSmoothing

    _ = _ExponentialSmoothing  # trigger class body
    STATSMODELS_HW_AVAILABLE = True
except Exception as exc:
    STATSMODELS_HW_AVAILABLE = False
    logger.warning("statsmodels_holtwinters_unavailable", error=str(exc))

# (score, metric_name) — metric_name: mape | mae | r2
AccuracyResult = Tuple[Optional[float], str]


class ForecastAlgorithmBase(ABC):
    name: ForecastAlgorithm

    @abstractmethod
    def fit_predict(
        self,
        historical: List[Tuple[datetime, float]],
        periods: int,
        interval_minutes: int = 5,
    ) -> Tuple[List[ForecastPoint], AccuracyResult]:
        raise NotImplementedError

    def _prepare(
        self,
        historical: List[Tuple[datetime, float]],
        interval_minutes: int,
        min_points: int,
    ) -> List[Tuple[datetime, float]]:
        return preprocess_timeseries(
            historical,
            interval_minutes,
            min_points=min_points,
        )

    def _calc_mae(self, actual: List[float], predicted: List[float]) -> Optional[float]:
        if len(actual) != len(predicted) or not actual:
            return None
        return round(sum(abs(a - p) for a, p in zip(actual, predicted)) / len(actual), 4)

    def _calc_mape(self, actual: List[float], predicted: List[float]) -> Optional[float]:
        if len(actual) != len(predicted) or not actual:
            return None
        valid = [(a, p) for a, p in zip(actual, predicted) if abs(a) > 0.01]
        if not valid:
            return None
        mape = sum(abs((a - p) / a) for a, p in valid) / len(valid) * 100
        return round(mape, 2)

    @staticmethod
    def _clamp(val: float, lo: float = 0.0, hi: float = 100.0) -> float:
        return round(max(lo, min(hi, val)), 4)

    def _detect_seasonal_period(
        self, n: int, interval_minutes: int
    ) -> Optional[int]:
        candidates = [
            int(1440 / interval_minutes),
            int(720 / interval_minutes),
            int(360 / interval_minutes),
        ]
        for period in candidates:
            if n >= 2 * period and period >= 2:
                return period
        return None

    def _holdout_split(
        self, values: np.ndarray, ratio: float = 0.2
    ) -> Tuple[np.ndarray, np.ndarray]:
        holdout = max(1, int(len(values) * ratio))
        return values[:-holdout], values[-holdout:]


class MovingAverageForecaster(ForecastAlgorithmBase):
    name = ForecastAlgorithm.MOVING_AVERAGE

    def __init__(self, window: int = 12) -> None:
        self.window = window

    def fit_predict(
        self,
        historical: List[Tuple[datetime, float]],
        periods: int,
        interval_minutes: int = 5,
    ) -> Tuple[List[ForecastPoint], AccuracyResult]:
        data = self._prepare(historical, interval_minutes, min_points=self.window + 4)
        if len(data) < self.window:
            return [], (None, "mape")

        values = [v for _, v in data]
        train, test = self._holdout_split(np.array(values))
        predicted_test: List[float] = []
        rolling = list(train[-self.window :])
        for _ in test:
            pred = float(np.mean(rolling[-self.window :]))
            predicted_test.append(pred)
            rolling.append(pred)

        accuracy = self._calc_mape(list(test), predicted_test)

        last_ts = data[-1][0]
        rolling = list(values[-self.window :])
        forecast_points: List[ForecastPoint] = []
        for i in range(1, periods + 1):
            pred_val = float(np.mean(rolling[-self.window :]))
            std = float(np.std(rolling[-self.window :]))
            forecast_points.append(
                ForecastPoint(
                    timestamp=last_ts + timedelta(minutes=interval_minutes * i),
                    value=self._clamp(pred_val),
                    lower_bound=self._clamp(pred_val - 1.96 * std),
                    upper_bound=self._clamp(pred_val + 1.96 * std),
                    is_forecast=True,
                )
            )
            rolling.append(pred_val)

        return forecast_points, (accuracy, "mape")


class LinearRegressionForecaster(ForecastAlgorithmBase):
    name = ForecastAlgorithm.LINEAR_REGRESSION

    def fit_predict(
        self,
        historical: List[Tuple[datetime, float]],
        periods: int,
        interval_minutes: int = 5,
    ) -> Tuple[List[ForecastPoint], AccuracyResult]:
        data = self._prepare(historical, interval_minutes, min_points=12)
        if len(data) < 12:
            return [], (None, "mape")

        timestamps = np.array([ts.timestamp() for ts, _ in data], dtype=np.float64)
        values = np.array([v for _, v in data], dtype=np.float64)
        t0 = timestamps[0]
        x = timestamps - t0

        train, test = self._holdout_split(values)
        x_train = x[: len(train)]
        x_test = x[len(train) :]

        slope, intercept, residual_std = self._fit_ols(x_train, train)
        pred_test = slope * x_test + intercept
        accuracy = self._calc_mape(list(test), list(pred_test))

        last_ts = data[-1][0]
        interval_secs = interval_minutes * 60
        forecast_points: List[ForecastPoint] = []
        for i in range(1, periods + 1):
            future_x = (last_ts.timestamp() - t0) + interval_secs * i
            pred_val = slope * future_x + intercept
            forecast_points.append(
                ForecastPoint(
                    timestamp=last_ts + timedelta(minutes=interval_minutes * i),
                    value=self._clamp(pred_val),
                    lower_bound=self._clamp(pred_val - 1.96 * residual_std),
                    upper_bound=self._clamp(pred_val + 1.96 * residual_std),
                    is_forecast=True,
                )
            )

        return forecast_points, (accuracy, "mape")

    @staticmethod
    def _fit_ols(x: np.ndarray, y: np.ndarray) -> Tuple[float, float, float]:
        x_mean, y_mean = x.mean(), y.mean()
        ss_xx = float(np.sum((x - x_mean) ** 2))
        if ss_xx == 0:
            slope = 0.0
        else:
            slope = float(np.sum((x - x_mean) * (y - y_mean)) / ss_xx)
        intercept = y_mean - slope * x_mean
        predicted = slope * x + intercept
        residual_std = float(np.std(y - predicted))
        return slope, intercept, residual_std


class HoltWintersForecaster(ForecastAlgorithmBase):
    """
    Triple exponential smoothing (Holt-Winters) with damped trend.
    Best default for VM CPU/RAM/disk (daily seasonality).
    """

    name = ForecastAlgorithm.HOLT_WINTERS

    def fit_predict(
        self,
        historical: List[Tuple[datetime, float]],
        periods: int,
        interval_minutes: int = 5,
    ) -> Tuple[List[ForecastPoint], AccuracyResult]:
        data = self._prepare(historical, interval_minutes, min_points=20)
        if len(data) < 20:
            logger.warning("insufficient_data_for_hw", count=len(data))
            return [], (None, "mape")

        values = np.array([v for _, v in data], dtype=np.float64)
        seasonal_period = self._detect_seasonal_period(len(values), interval_minutes)

        try:
            if STATSMODELS_HW_AVAILABLE and _ExponentialSmoothing is not None:
                return self._fit_statsmodels(
                    data, values, periods, interval_minutes, seasonal_period
                )
            return self._fit_native(
                data, values, periods, interval_minutes, seasonal_period
            )
        except Exception as e:
            logger.error("hw_fit_error", error=str(e))
            return self._fit_native(
                data, values, periods, interval_minutes, seasonal_period
            )

    def _fit_statsmodels(
        self,
        data: List[Tuple[datetime, float]],
        values: np.ndarray,
        periods: int,
        interval_minutes: int,
        seasonal_period: Optional[int],
    ) -> Tuple[List[ForecastPoint], AccuracyResult]:
        model = self._build_hw_model(values, seasonal_period)
        fitted = model.fit(optimized=True, maxiter=500)

        train, test = self._holdout_split(values)
        val_model = self._build_hw_model(train, seasonal_period)
        val_fitted = val_model.fit(optimized=True, maxiter=300)
        val_forecast = val_fitted.forecast(len(test))
        accuracy = self._calc_mape(list(test), list(val_forecast))

        forecast_vals = fitted.forecast(periods)
        residual_std = float(np.std(values - fitted.fittedvalues))
        return self._build_forecast_points(
            data[-1][0],
            forecast_vals,
            periods,
            interval_minutes,
            residual_std,
            accuracy,
        )

    def _fit_native(
        self,
        data: List[Tuple[datetime, float]],
        values: np.ndarray,
        periods: int,
        interval_minutes: int,
        seasonal_period: Optional[int],
    ) -> Tuple[List[ForecastPoint], AccuracyResult]:
        _, future, residual_std = holt_forecast(values, periods, seasonal_period)
        if len(future) == 0:
            return [], (None, "mape")

        holdout = max(1, len(values) // 5)
        train, test = values[:-holdout], values[-holdout:]
        _, val_future, _ = holt_forecast(train, len(test), seasonal_period)
        accuracy = self._calc_mape(list(test), list(val_future[: len(test)]))

        return self._build_forecast_points(
            data[-1][0],
            future,
            periods,
            interval_minutes,
            residual_std,
            accuracy,
        )

    def _build_forecast_points(
        self,
        last_ts: datetime,
        forecast_vals,
        periods: int,
        interval_minutes: int,
        residual_std: float,
        accuracy: Optional[float],
    ) -> Tuple[List[ForecastPoint], AccuracyResult]:
        forecast_points: List[ForecastPoint] = []
        for i in range(periods):
            pred_val = float(
                forecast_vals.iloc[i]
                if hasattr(forecast_vals, "iloc")
                else forecast_vals[i]
            )
            uncertainty = residual_std * (1.0 + 0.08 * i)
            forecast_points.append(
                ForecastPoint(
                    timestamp=last_ts + timedelta(minutes=interval_minutes * (i + 1)),
                    value=self._clamp(pred_val),
                    lower_bound=self._clamp(pred_val - 1.96 * uncertainty),
                    upper_bound=self._clamp(pred_val + 1.96 * uncertainty),
                    is_forecast=True,
                )
            )
        return forecast_points, (accuracy, "mape")

    def _build_hw_model(self, values: np.ndarray, seasonal_period: Optional[int]):
        if seasonal_period is not None:
            return _ExponentialSmoothing(
                values,
                trend="add",
                damped_trend=True,
                seasonal="add",
                seasonal_periods=seasonal_period,
                initialization_method="estimated",
            )
        return _ExponentialSmoothing(
            values,
            trend="add",
            damped_trend=True,
            seasonal=None,
            initialization_method="estimated",
        )


class ARIMAForecaster(ForecastAlgorithmBase):
    """SARIMA with compact order search and 95% prediction intervals."""

    name = ForecastAlgorithm.ARIMA

    def fit_predict(
        self,
        historical: List[Tuple[datetime, float]],
        periods: int,
        interval_minutes: int = 5,
    ) -> Tuple[List[ForecastPoint], AccuracyResult]:
        try:
            from statsmodels.tsa.statespace.sarimax import SARIMAX
        except Exception as exc:
            logger.error("statsmodels_sarimax_unavailable", error=str(exc))
            return [], (None, "mape")

        data = self._prepare(historical, interval_minutes, min_points=24)
        if len(data) < 24:
            logger.warning("insufficient_data_for_arima", count=len(data))
            return [], (None, "mape")

        values = np.array([v for _, v in data], dtype=np.float64)
        seasonal_period = self._detect_seasonal_period(len(values), interval_minutes)
        if seasonal_period and seasonal_period > 48:
            seasonal_period = None

        try:
            best_order, best_seasonal = self._find_best_order(values, seasonal_period)
            model = SARIMAX(
                values,
                order=best_order,
                seasonal_order=best_seasonal or (0, 0, 0, 0),
                enforce_stationarity=False,
                enforce_invertibility=False,
            )
            # Cap periods to avoid very long ARIMA fitting for large forecasts
            arima_periods = min(periods, 200)
            result = model.fit(disp=False, maxiter=60)

            train, test = self._holdout_split(values)
            try:
                val_model = SARIMAX(
                    train,
                    order=best_order,
                    seasonal_order=best_seasonal or (0, 0, 0, 0),
                    enforce_stationarity=False,
                    enforce_invertibility=False,
                )
                val_result = val_model.fit(disp=False, maxiter=30)
                val_forecast = val_result.forecast(len(test))
                accuracy = self._calc_mape(list(test), list(val_forecast))
            except Exception:
                accuracy = None

            forecast_result = result.get_forecast(steps=arima_periods)
            forecast_vals = forecast_result.predicted_mean
            conf_int = forecast_result.conf_int(alpha=0.05)
            last_ts = data[-1][0]
            forecast_points: List[ForecastPoint] = []

            for i in range(arima_periods):
                pred_val = float(
                    forecast_vals.iloc[i]
                    if hasattr(forecast_vals, "iloc")
                    else forecast_vals[i]
                )
                lower = float(conf_int.iloc[i, 0] if hasattr(conf_int, "iloc") else conf_int[i, 0])
                upper = float(conf_int.iloc[i, 1] if hasattr(conf_int, "iloc") else conf_int[i, 1])
                forecast_points.append(
                    ForecastPoint(
                        timestamp=last_ts + timedelta(minutes=interval_minutes * (i + 1)),
                        value=self._clamp(pred_val),
                        lower_bound=self._clamp(lower),
                        upper_bound=self._clamp(upper),
                        is_forecast=True,
                    )
                )

            return forecast_points, (accuracy, "mape")

        except Exception as e:
            logger.error("arima_fit_error", error=str(e))
            return [], (None, "mape")

    def _find_best_order(
        self,
        values: np.ndarray,
        seasonal_period: Optional[int],
    ) -> Tuple[Tuple[int, int, int], Optional[Tuple[int, int, int, int]]]:
        from statsmodels.tsa.statespace.sarimax import SARIMAX

        best_aic = float("inf")
        best_order = (1, 1, 1)
        best_seasonal: Optional[Tuple[int, int, int, int]] = None
        # Only try 2 compact orders to keep fitting fast
        orders = [(1, 1, 1), (0, 1, 1)]

        for order in orders:
            try:
                seasonal_order = (1, 0, 1, seasonal_period) if seasonal_period else None
                model = SARIMAX(
                    values,
                    order=order,
                    seasonal_order=seasonal_order or (0, 0, 0, 0),
                    enforce_stationarity=False,
                    enforce_invertibility=False,
                )
                fit = model.fit(disp=False, maxiter=20)
                if fit.aic < best_aic:
                    best_aic = fit.aic
                    best_order = order
                    best_seasonal = seasonal_order
            except Exception:
                continue

        return best_order, best_seasonal


class AutoForecaster(ForecastAlgorithmBase):
    """
    Selects best model via holdout MAPE among candidates.
    Uses fresh instances per call to avoid state sharing between concurrent requests.
    """

    name = ForecastAlgorithm.AUTO

    def __init__(self) -> None:
        self.last_selected: ForecastAlgorithm = ForecastAlgorithm.HOLT_WINTERS

    def fit_predict(
        self,
        historical: List[Tuple[datetime, float]],
        periods: int,
        interval_minutes: int = 5,
    ) -> Tuple[List[ForecastPoint], AccuracyResult]:
        n_points = len(historical)

        # Build candidate list — only include ARIMA when enough data to fit quickly
        candidates: List[ForecastAlgorithmBase] = [
            HoltWintersForecaster(),
            MovingAverageForecaster(window=max(6, int(60 / interval_minutes))),
            LinearRegressionForecaster(),
        ]
        # Add ARIMA only when we have sufficient data (≥48 points after preprocessing)
        if n_points >= 48:
            candidates.append(ARIMAForecaster())

        best_points: List[ForecastPoint] = []
        best_score: Optional[float] = None
        best_algo = ForecastAlgorithm.MOVING_AVERAGE

        for forecaster in candidates:
            try:
                points, (score, _metric) = forecaster.fit_predict(
                    historical, periods, interval_minutes
                )
            except Exception as exc:
                logger.warning(
                    "auto_candidate_failed",
                    algorithm=forecaster.name.value,
                    error=str(exc),
                )
                continue

            if not points:
                continue

            if score is None:
                # Accept result only if we have nothing better yet
                if not best_points:
                    best_points = points
                    best_score = score
                    best_algo = forecaster.name
                continue

            if best_score is None or score < best_score:
                best_points = points
                best_score = score
                best_algo = forecaster.name

        if not best_points:
            # Last-resort fallback: plain moving average
            lr = MovingAverageForecaster(window=max(6, int(60 / interval_minutes)))
            self.last_selected = ForecastAlgorithm.MOVING_AVERAGE
            return lr.fit_predict(historical, periods, interval_minutes)

        self.last_selected = best_algo
        logger.info("auto_forecast_selected", algorithm=best_algo.value, mape=best_score)
        return best_points, (best_score, "mape")


class ProphetForecaster(ForecastAlgorithmBase):
    name = ForecastAlgorithm.PROPHET

    def fit_predict(self, historical, periods, interval_minutes=5):
        raise NotImplementedError("Prophet belum diintegrasikan.")


class LSTMForecaster(ForecastAlgorithmBase):
    name = ForecastAlgorithm.LSTM

    def fit_predict(self, historical, periods, interval_minutes=5):
        raise NotImplementedError("LSTM belum diintegrasikan.")


_REGISTRY: dict[ForecastAlgorithm, ForecastAlgorithmBase] = {
    ForecastAlgorithm.MOVING_AVERAGE: MovingAverageForecaster(),
    ForecastAlgorithm.LINEAR_REGRESSION: LinearRegressionForecaster(),
    ForecastAlgorithm.HOLT_WINTERS: HoltWintersForecaster(),
    ForecastAlgorithm.ARIMA: ARIMAForecaster(),
    ForecastAlgorithm.AUTO: AutoForecaster(),
    ForecastAlgorithm.PROPHET: ProphetForecaster(),
    ForecastAlgorithm.LSTM: LSTMForecaster(),
}


def get_forecaster(algorithm: ForecastAlgorithm) -> ForecastAlgorithmBase:
    if algorithm not in _REGISTRY:
        raise ValueError(f"Unknown algorithm: {algorithm}")
    # AutoForecaster stores last_selected state — always return a fresh instance
    if algorithm == ForecastAlgorithm.AUTO:
        return AutoForecaster()
    return _REGISTRY[algorithm]
