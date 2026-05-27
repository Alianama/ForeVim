"use client";

import ReactECharts from "echarts-for-react";
import { format } from "date-fns";
import type { ForecastMetric, ForecastResponse } from "@/types";
import { formatAccuracy, FORECAST_ALGORITHMS } from "@/lib/forecast-algorithms";
import { TrendingUp, Info, AlertCircle } from "lucide-react";

interface Props {
  data?: ForecastResponse;
  isLoading: boolean;
  metric: ForecastMetric;
}

const METRIC_COLORS: Record<ForecastMetric, string> = {
  cpu: "#3b82f6",
  ram: "#10b981",
  disk: "#f59e0b",
};

export function ForecastChart({ data, isLoading, metric }: Props) {
  const color = METRIC_COLORS[metric];

  if (isLoading) {
    return <div className="chart-container skeleton h-80" />;
  }

  const hasHistorical = (data?.historical.length ?? 0) > 0;
  const hasForecast = (data?.forecast.length ?? 0) > 0;

  if (!data || (!hasHistorical && !hasForecast)) {
    return (
      <div className="chart-container h-80 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2 px-6 text-center">
        <AlertCircle className="w-8 h-8 opacity-40" />
        <p>No forecast data yet.</p>
        {data?.model_info && (
          <p className="text-xs text-amber-600 dark:text-amber-400 max-w-md">{data.model_info}</p>
        )}
        <p className="text-xs">
          Select a VM then click <strong>Run Forecast</strong>. Ensure the VM has been synced with
          a Prometheus source.
        </p>
      </div>
    );
  }

  const historicalDates = data.historical.map((d) =>
    format(new Date(d.timestamp), "MMM d HH:mm")
  );
  const forecastDates = data.forecast.map((d) =>
    format(new Date(d.timestamp), "MMM d HH:mm")
  );
  const allDates = [...historicalDates, ...forecastDates];

  const forecastValues = data.forecast.map((d) => d.value);
  const lowerBounds = data.forecast.map((d) => d.lower_bound ?? d.value);
  const upperBounds = data.forecast.map((d) => d.upper_bound ?? d.value);

  const historicalSeries = [
    ...data.historical.map((d) => d.value),
    ...data.forecast.map(() => null),
  ];
  const forecastSeries = [
    ...data.historical.map(() => null),
    ...forecastValues,
  ];
  const lowerSeries = [...data.historical.map(() => null), ...lowerBounds];
  const upperSeries = [...data.historical.map(() => null), ...upperBounds];

  const splitIndex = data.historical.length - 1;
  const algoLabel =
    FORECAST_ALGORITHMS.find((a) => a.value === data.algorithm)?.label ??
    data.algorithm.replace(/_/g, " ");
  const accuracyLabel = formatAccuracy(data.accuracy_score, data.accuracy_metric);

  const option = {
    backgroundColor: "transparent",
    animation: true,
    legend: {
      data: hasForecast
        ? ["Historical", "Forecast", "95% Confidence Interval"]
        : ["Historical (Prometheus)"],
      textStyle: { color: "hsl(215,20%,65%)", fontSize: 11 },
      top: 0,
    },
    grid: { top: 40, right: 16, bottom: 30, left: 48 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: allDates.length ? allDates : historicalDates,
      axisLabel: {
        fontSize: 10,
        interval: Math.floor((allDates.length || historicalDates.length) / 8) || 1,
      },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
      axisLabel: { formatter: "{value}%" },
    },
    series: [
      {
        name: "Historical",
        type: "line",
        data: hasForecast ? historicalSeries : data.historical.map((d) => d.value),
        smooth: true,
        symbol: "none",
        lineStyle: { color, width: 2 },
        markLine: hasForecast
          ? {
              silent: true,
              symbol: "none",
              data: [{ xAxis: splitIndex >= 0 ? splitIndex : 0 }],
              lineStyle: { type: "dotted", color: "hsl(215,20%,40%)" },
              label: { show: false },
            }
          : undefined,
      },
      ...(hasForecast
        ? [
            {
              name: "Forecast",
              type: "line",
              data: forecastSeries,
              smooth: true,
              symbol: "none",
              lineStyle: { color: color + "cc", width: 2, type: "dashed" },
            },
            {
              name: "Upper",
              type: "line",
              data: upperSeries,
              smooth: true,
              symbol: "none",
              lineStyle: { color: "transparent" },
              areaStyle: { color: color + "18" },
              stack: "confidence",
              silent: true,
              showInLegend: false,
            },
            {
              name: "Lower",
              type: "line",
              data: lowerSeries,
              smooth: true,
              symbol: "none",
              lineStyle: { color: "transparent" },
              stack: "confidence",
              silent: true,
              showInLegend: false,
            },
          ]
        : []),
    ],
  };

  return (
    <div className="chart-container">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <TrendingUp className="w-4 h-4 text-primary" />
          <span>
            {metric.toUpperCase()} — {data.period_days} days
            {!hasForecast && hasHistorical && " (historical only)"}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{algoLabel}</span>
          {accuracyLabel && (
            <span>
              Accuracy: <span className="font-mono text-foreground">{accuracyLabel}</span>
            </span>
          )}
        </div>
      </div>

      {!hasForecast && hasHistorical && (
        <div className="flex items-start gap-2 mb-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            {data.model_info ||
              "Historical data from Prometheus is available, but prediction could not be formed. Try the Moving Average algorithm or a shorter period."}
          </span>
        </div>
      )}

      {data.model_info && hasForecast && (
        <div className="flex items-start gap-2 mb-2 px-3 py-2 rounded-lg bg-secondary/50 border border-border/60 text-xs text-muted-foreground">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{data.model_info}</span>
        </div>
      )}

      <ReactECharts option={option} style={{ height: "320px" }} opts={{ renderer: "canvas" }} />
    </div>
  );
}
