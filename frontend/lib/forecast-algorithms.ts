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
    label: "Auto (Rekomendasi)",
    description: "Pilih Holt-Winters atau MA berdasarkan MAPE holdout (hemat CPU)",
    recommended: true,
  },
  {
    value: "holt_winters",
    label: "Holt-Winters (ETS)",
    description: "Exponential smoothing + musiman harian — ideal untuk beban VM",
    recommended: true,
  },
  {
    value: "arima",
    label: "SARIMA (ARIMA)",
    description: "Model statistik dengan interval prediksi 95%",
  },
  {
    value: "moving_average",
    label: "Moving Average",
    description: "Baseline sederhana, stabil untuk data pendek",
  },
  {
    value: "linear_regression",
    label: "Linear Regression",
    description: "Tren linear — cocok untuk pertumbuhan monoton",
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
