"use client";

import ReactECharts from "echarts-for-react";
import { format } from "date-fns";
import type { MetricDataPoint } from "@/types";
import type { ReactNode } from "react";

interface Props {
  title: string;
  data: MetricDataPoint[];
  color: string;
  unit?: string;
  icon?: ReactNode;
  threshold?: number;
}

export function MetricLineChart({ title, data, color, unit = "%", icon, threshold }: Props) {
  const timestamps = data.map((d) => format(new Date(d.timestamp), "HH:mm"));
  const values = data.map((d) => d.value);
  const hasData = data.length > 0;

  const option = {
    backgroundColor: "transparent",
    animation: true,
    animationDuration: 800,
    grid: { top: 10, right: 16, bottom: 30, left: 48 },
    tooltip: {
      trigger: "axis",
      backgroundColor: "hsl(222, 47%, 13%)",
      borderColor: "hsl(217, 33%, 22%)",
      textStyle: { color: "#e2e8f0", fontSize: 12 },
      formatter: (params: any) => {
        const p = params[0];
        return `<div style="font-size:11px;opacity:0.7">${p.name}</div>
                <div style="font-weight:600">${p.value?.toFixed(2)}${unit}</div>`;
      },
    },
    xAxis: {
      type: "category",
      data: timestamps,
      axisLine: { lineStyle: { color: "hsl(217,33%,22%)" } },
      axisTick: { show: false },
      axisLabel: {
        color: "hsl(215,20%,55%)",
        fontSize: 10,
        interval: Math.floor(timestamps.length / 6) || 1,
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: unit === "%" ? 100 : undefined,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: "hsl(215,20%,55%)", fontSize: 10, formatter: `{value}${unit}` },
      splitLine: { lineStyle: { color: "hsl(217,33%,16%)", type: "dashed" } },
    },
    series: [
      // Area series
      {
        type: "line",
        data: values,
        smooth: true,
        symbol: "none",
        lineStyle: { color, width: 2 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: color + "40" },
              { offset: 1, color: color + "00" },
            ],
          },
        },
      },
      // Threshold line
      ...(threshold
        ? [
            {
              type: "line",
              markLine: {
                silent: true,
                data: [{ yAxis: threshold }],
                lineStyle: { color: "#ef4444", type: "dashed", width: 1, opacity: 0.5 },
                label: {
                  formatter: `${threshold}%`,
                  color: "#ef4444",
                  fontSize: 10,
                  opacity: 0.7,
                },
              },
            },
          ]
        : []),
    ],
  };

  const latestVal = values[values.length - 1];

  return (
    <div className="chart-container">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span style={{ color }}>{icon}</span>
          <span>{title}</span>
        </div>
        {latestVal !== undefined && (
          <span
            className="text-xs font-bold tabular-nums"
            style={{ color }}
          >
            {latestVal.toFixed(1)}{unit}
          </span>
        )}
      </div>

      {!hasData ? (
        <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
          No data available
        </div>
      ) : (
        <ReactECharts
          option={option}
          style={{ height: "160px" }}
          opts={{ renderer: "canvas" }}
        />
      )}
    </div>
  );
}
