/**
 * WebSocket hook that connects on mount and exposes state via Zustand.
 */
"use client";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGlobalWS } from "@/websocket/client";
import { useRealtimeStore, useForecastScanStore } from "@/stores";
import type {
  WSAlertData,
  WSMetricsData,
  ForecastScanStartData,
  ForecastScanProgressData,
  ForecastScanCompleteData,
} from "@/types";

export function useWebSocket() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const ws = getGlobalWS();
    ws.connect();

    const offMetrics = ws.on<WSMetricsData>("metrics_update", (data) => {
      useRealtimeStore.getState().updateMetrics(data.vm_id, {
        cpu_usage: data.cpu_usage,
        ram_usage: data.ram_usage,
        disk_usage: data.disk_usage,
        disk_used_gb: data.disk_used_gb,
        disk_total_gb: data.disk_total_gb,
        status: data.status,
        collected_at: data.collected_at,
      } as any);
    });

    const offAlert = ws.on<WSAlertData>("alert", (data) => {
      useRealtimeStore.getState().addAlert(data);
    });

    const offPong = ws.on("pong", () => {
      useRealtimeStore.getState().setWsConnected(true);
    });

    const offScanStart = ws.on<ForecastScanStartData>(
      "forecast_scan_start",
      (data) => {
        useForecastScanStore.getState().onScanStart(data);
      },
    );

    const offScanProgress = ws.on<ForecastScanProgressData>(
      "forecast_scan_progress",
      (data) => {
        useForecastScanStore.getState().onScanProgress(data);
      },
    );

    const offScanComplete = ws.on<ForecastScanCompleteData>(
      "forecast_scan_complete",
      (data) => {
        useForecastScanStore.getState().onScanComplete(data);
        // Refresh forecast overview table automatically
        queryClient.invalidateQueries({ queryKey: ["forecasts", "overview"] });
      },
    );

    // Periodic connection state check
    const interval = setInterval(() => {
      useRealtimeStore.getState().setWsConnected(ws.isConnected);
    }, 5000);

    return () => {
      offMetrics();
      offAlert();
      offPong();
      offScanStart();
      offScanProgress();
      offScanComplete();
      clearInterval(interval);
    };
  }, [queryClient]);
}
