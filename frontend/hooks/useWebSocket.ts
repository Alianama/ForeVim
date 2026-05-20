/**
 * WebSocket hook that connects on mount and exposes state via Zustand.
 */
"use client";
import { useEffect } from "react";
import { getGlobalWS } from "@/websocket/client";
import { useRealtimeStore } from "@/stores";
import type { WSAlertData, WSMetricsData } from "@/types";

export function useWebSocket() {
  // Tidak perlu subscribe ke store, gunakan getState() di dalam useEffect
  // agar komponen yang menggunakan hook ini tidak re-render tiap ada metrics baru.

  useEffect(() => {
    const ws = getGlobalWS();
    ws.connect();

    const offMetrics = ws.on<WSMetricsData>("metrics_update", (data) => {
      useRealtimeStore.getState().updateMetrics(data.vm_id, {
        cpu_usage: data.cpu_usage,
        ram_usage: data.ram_usage,
        disk_usage: data.disk_usage,
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

    // Periodic connection state check
    const interval = setInterval(() => {
      useRealtimeStore.getState().setWsConnected(ws.isConnected);
    }, 5000);

    return () => {
      offMetrics();
      offAlert();
      offPong();
      clearInterval(interval);
    };
  }, []);

  // Tidak perlu me-return state store di sini.
  // Jika komponen butuh data dari store, mereka bisa panggil useRealtimeStore secara langsung.
  // Me-return object baru (s => ({...})) tanpa shallow equality check akan memicu
  // infinite re-render loop (React error #185) jika dipanggil di level layout.
}
