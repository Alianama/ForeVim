import type { ForecastAlgorithm } from "@/types";

export interface ForecastAlgorithmOption {
  value: ForecastAlgorithm;
  label: string;
  description: string;
  recommended?: boolean;
}

export const FORECAST_ALGORITHMS: ForecastAlgorithmOption[] = [
  {
    value: "auto",
    label: "Auto (Recommended)",
    description: "Automatically select Holt-Winters or Moving Average based on holdout MAPE (CPU efficient)",
    recommended: true,
  },
  {
    value: "holt_winters",
    label: "Holt-Winters (ETS)",
    description: "Exponential smoothing + daily seasonality — ideal for VM workloads",
    recommended: true,
  },
  {
    value: "arima",
    label: "SARIMA (ARIMA)",
    description: "Statistical model with 95% prediction interval",
  },
  {
    value: "moving_average",
    label: "Moving Average",
    description: "Simple baseline, stable for short historical data",
  },
  {
    value: "linear_regression",
    label: "Linear Regression",
    description: "Linear trend — suitable for monotonic growth",
  },
];

export function formatAccuracy(
  score: number | null | undefined,
  metric: string | null | undefined
): string | null {
  if (score == null) return null;
  if (metric === "mape") return `MAPE ${score.toFixed(1)}%`;
  if (metric === "mae") return `MAE ${score.toFixed(2)}`;
  if (metric === "r2") return `R² ${(score * 100).toFixed(1)}%`;
  return `${score}`;
}
