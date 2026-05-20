/**
 * TanStack Query hooks for data fetching.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { alertService, vmService, userService, prometheusService } from "@/services";
import type { ForecastAlgorithm, ForecastMetric, VMCreate } from "@/types";

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const queryKeys = {
  vms: ["vms"] as const,
  vm: (id: string) => ["vms", id] as const,
  vmMetrics: (id: string) => ["vms", id, "metrics"] as const,
  vmHistory: (id: string, metric: string, hours: number) =>
    ["vms", id, "history", metric, hours] as const,
  vmForecast: (
    id: string,
    metric: ForecastMetric,
    algorithm: ForecastAlgorithm,
    days: number
  ) => ["vms", id, "forecast", metric, algorithm, days] as const,
  summary: ["dashboard", "summary"] as const,
  alerts: (vmId?: string, status?: string) =>
    ["alerts", vmId, status] as const,
};

// ─── VM Hooks ─────────────────────────────────────────────────────────────────

export function useVMs() {
  return useQuery({
    queryKey: queryKeys.vms,
    queryFn: () => vmService.list(),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function useVM(id: string) {
  return useQuery({
    queryKey: queryKeys.vm(id),
    queryFn: () => vmService.get(id),
    enabled: !!id,
  });
}

export function useVMMetrics(id: string) {
  return useQuery({
    queryKey: queryKeys.vmMetrics(id),
    queryFn: () => vmService.metrics(id),
    enabled: !!id,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

export function useVMHistory(
  id: string,
  metric: string,
  hours: number,
  step: string
) {
  return useQuery({
    queryKey: queryKeys.vmHistory(id, metric, hours),
    queryFn: () => vmService.history(id, metric, hours, step),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useVMForecast(
  id: string,
  metric: ForecastMetric,
  algorithm: ForecastAlgorithm,
  periodDays: number
) {
  return useQuery({
    queryKey: queryKeys.vmForecast(id, metric, algorithm, periodDays),
    queryFn: () => vmService.forecast(id, metric, algorithm, periodDays),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });
}

export function usePrometheusRetention() {
  return useQuery({
    queryKey: ["prometheus", "retention"],
    queryFn: () => prometheusService.retention().then((res) => res.retention_days),
    staleTime: 24 * 60 * 60 * 1000, // Caches retention for 24 hours
  });
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: queryKeys.summary,
    queryFn: () => vmService.summary(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useCreateVM() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: VMCreate) => vmService.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.vms });
      qc.invalidateQueries({ queryKey: queryKeys.summary });
    },
  });
}

export function useDeleteVM() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => vmService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.vms });
      qc.invalidateQueries({ queryKey: queryKeys.summary });
    },
  });
}

// ─── Alert Hooks ──────────────────────────────────────────────────────────────

export function useAlerts(vmId?: string, status?: string) {
  return useQuery({
    queryKey: queryKeys.alerts(vmId, status),
    queryFn: () => alertService.list(vmId, status),
    refetchInterval: 30_000,
  });
}

export function useAcknowledgeAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => alertService.acknowledge(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}

// ─── Users Hooks ──────────────────────────────────────────────────────────────

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => userService.list(),
  });
}
