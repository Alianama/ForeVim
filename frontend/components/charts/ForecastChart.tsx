"use client";

import ReactECharts from "echarts-for-react";
import { format } from "date-fns";
import type { ForecastMetric, ForecastResponse } from "@/types";
import { TrendingUp } from "lucide-react";

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

  if (!data || (!data.historical.length && !data.forecast.length)) {
    return (
      <div className="chart-container h-80 flex items-center justify-center text-muted-foreground text-sm">
        No forecast data. Insufficient historical metrics.
      </div>
    );
  }

  // Merge historical + forecast for the chart
  const historicalDates = data.historical.map((d) =>
    format(new Date(d.timestamp), "MMM d HH:mm")
  );
  const historicalValues = data.historical.map((d) => [
    format(new Date(d.timestamp), "MMM d HH:mm"),
    d.value,
  ]);

  const forecastDates = data.forecast.map((d) =>
    format(new Date(d.timestamp), "MMM d HH:mm")
  );
  const forecastValues = data.forecast.map((d) => d.value);
  const lowerBounds = data.forecast.map((d) => d.lower_bound ?? d.value);
  const upperBounds = data.forecast.map((d) => d.upper_bound ?? d.value);

  const allDates = [...historicalDates, ...forecastDates];

  // Pad historical with nulls for forecast region
  const historicalSeries = [
    ...data.historical.map((d) => d.value),
    ...data.forecast.map(() => null),
  ];
  const forecastSeries = [
    ...data.historical.map(() => null),
    ...forecastValues,
  ];
  const lowerSeries = [
    ...data.historical.map(() => null),
    ...lowerBounds,
  ];
  const upperSeries = [
    ...data.historical.map(() => null),
    ...upperBounds,
  ];

  const option = {
    backgroundColor: "transparent",
    animation: true,
    animationDuration: 1000,
    legend: {
      data: ["Historical", "Forecast", "Confidence Band"],
      textStyle: { color: "hsl(215,20%,65%)", fontSize: 11 },
      top: 0,
    },
    grid: { top: 35, right: 16, bottom: 30, left: 48 },
    tooltip: {
      trigger: "axis",
      backgroundColor: "hsl(222, 47%, 13%)",
      borderColor: "hsl(217, 33%, 22%)",
      textStyle: { color: "#e2e8f0", fontSize: 12 },
    },
    xAxis: {
      type: "category",
      data: allDates,
      axisLine: { lineStyle: { color: "hsl(217,33%,22%)" } },
      axisTick: { show: false },
      axisLabel: {
        color: "hsl(215,20%,55%)",
        fontSize: 10,
        interval: Math.floor(allDates.length / 8) || 1,
        rotate: 0,
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: "hsl(215,20%,55%)", fontSize: 10, formatter: "{value}%" },
      splitLine: { lineStyle: { color: "hsl(217,33%,16%)", type: "dashed" } },
    },
    series: [
      {
        name: "Historical",
        type: "line",
        data: historicalSeries,
        smooth: true,
        symbol: "none",
        lineStyle: { color, width: 2 },
        areaStyle: {
          color: {
            type: "linear", x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: color + "30" },
              { offset: 1, color: color + "00" },
            ],
          },
        },
      },
      {
        name: "Forecast",
        type: "line",
        data: forecastSeries,
        smooth: true,
        symbol: "none",
        lineStyle: { color: color + "cc", width: 2, type: "dashed" },
      },
      // Upper bound (hidden, for band)
      {
        name: "Upper",
        type: "line",
        data: upperSeries,
        smooth: true,
        symbol: "none",
        lineStyle: { color: "transparent" },
        areaStyle: {
          color: color + "20",
          origin: "start",
        },
        stack: "confidence",
        silent: true,
        legendHoverLink: false,
        showInLegend: false,
      },
      // Lower bound
      {
        name: "Lower",
        type: "line",
        data: lowerSeries,
        smooth: true,
        symbol: "none",
        lineStyle: { color: "transparent" },
        areaStyle: {
          color: "#00000000",
          origin: "start",
        },
        stack: "confidence",
        silent: true,
        legendHoverLink: false,
        showInLegend: false,
      },
      // Threshold
      {
        type: "line",
        markLine: {
          silent: true,
          data: [{ yAxis: 85 }],
          lineStyle: { color: "#ef4444", type: "dashed", width: 1, opacity: 0.4 },
          label: { formatter: "Threshold 85%", color: "#ef444466", fontSize: 10 },
        },
      },
    ],
  };

  return (
    <div className="chart-container">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <TrendingUp className="w-4 h-4 text-primary" />
          <span>{metric.toUpperCase()} Forecast — {data.period_days} days</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {data.accuracy_score !== null && (
            <span>
              Accuracy (R²):{" "}
              <span className="text-foreground font-mono">
                {(data.accuracy_score * 100).toFixed(1)}%
              </span>
            </span>
          )}
          <span className="capitalize text-muted-foreground">
            {data.algorithm.replace("_", " ")}
          </span>
        </div>
      </div>
      <ReactECharts
        option={option}
        style={{ height: "320px" }}
        opts={{ renderer: "canvas" }}
      />
    </div>
  );
}
