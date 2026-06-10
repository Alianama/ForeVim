import type { ForecastAlgorithm } from "@/types";

export interface ForecastAlgorithmOption {
  value: ForecastAlgorithm;
  label: string;
  description: string;
  recommended?: boolean;
}

export const FORECAST_ALGORITHMS: ForecastAlgorithmOption[] = [
  {
    value: "arima",
    label: "SARIMA",
    description: "Seasonal Autoregressive Integrated Moving Average statistical model with 95% prediction interval",
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
