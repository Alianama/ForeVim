/**
 * TanStack Query hooks for data fetching.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  alertService,
  vmService,
  userService,
  prometheusService,
  forecastService,
} from "@/services";
import type {
  ForecastAlgorithm,
  ForecastMetric,
  VMCreate,
  PrometheusSourceCreate,
  PrometheusSourceUpdate,
} from "@/types";

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
    days: number,
  ) => ["vms", id, "forecast", metric, algorithm, days] as const,
  summary: ["dashboard", "summary"] as const,
  alerts: (vmId?: string, status?: string) => ["alerts", vmId, status] as const,
};

// ─── VM Hooks ─────────────────────────────────────────────────────────────────

export function useVMs(options?: { refetchInterval?: number | false }) {
  return useQuery({
    queryKey: queryKeys.vms,
    queryFn: () => vmService.list(),
    staleTime:
      options?.refetchInterval !== undefined
        ? Math.min(
            5000,
            typeof options.refetchInterval === "number"
              ? options.refetchInterval
              : 5000,
          )
        : 30_000,
    refetchInterval:
      options?.refetchInterval !== undefined ? options.refetchInterval : 30_000,
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

export function useVMDiskMounts(id: string) {
  return useQuery({
    queryKey: ["vms", id, "disk-mounts"] as const,
    queryFn: () => vmService.diskMounts(id),
    enabled: !!id,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useVMHistory(
  id: string,
  metric: string,
  hours: number,
  step: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.vmHistory(id, metric, hours),
    queryFn: () => vmService.history(id, metric, hours, step),
    enabled: options?.enabled !== false && !!id,
    staleTime: 60_000,
    // History data tidak perlu di-refetch otomatis — user minta manual atau ganti range
    refetchOnWindowFocus: false,
  });
}

export function useVMForecast(
  id: string,
  metric: ForecastMetric,
  algorithm: ForecastAlgorithm,
  periodDays: number,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.vmForecast(id, metric, algorithm, periodDays),
    queryFn: () => vmService.forecast(id, metric, algorithm, periodDays, false),
    enabled: options?.enabled !== false && !!id,
    staleTime: 5 * 60_000,
    // Forecast adalah komputasi berat — jangan retry berkali-kali
    retry: 1,
    retryDelay: 2_000,
    refetchOnWindowFocus: false,
  });
}

export function useGenerateForecast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      metric,
      algorithm,
      periodDays,
    }: {
      id: string;
      metric: ForecastMetric;
      algorithm: ForecastAlgorithm;
      periodDays: number;
    }) => vmService.generateForecast(id, metric, algorithm, periodDays),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({
        queryKey: queryKeys.vmForecast(
          vars.id,
          vars.metric,
          vars.algorithm,
          vars.periodDays,
        ),
      });
      qc.invalidateQueries({ queryKey: ["forecast", "history", vars.id] });
    },
  });
}

export function useForecastHistory(vmId: string, enabled = true) {
  return useQuery({
    queryKey: ["forecast", "history", vmId],
    queryFn: () => vmService.forecastHistory(vmId),
    enabled: !!vmId && enabled,
    staleTime: 30_000,
  });
}

export function usePrometheusRetention(sourceId?: string) {
  return useQuery({
    queryKey: ["prometheus", "retention", sourceId],
    queryFn: () =>
      prometheusService.retention(sourceId).then((res) => res.retention_days),
    staleTime: 24 * 60 * 60 * 1000, // Caches retention for 24 hours
  });
}

export function useDashboardSummary(options?: {
  refetchInterval?: number | false;
}) {
  return useQuery({
    queryKey: queryKeys.summary,
    queryFn: () => vmService.summary(),
    staleTime:
      options?.refetchInterval !== undefined
        ? Math.min(
            5000,
            typeof options.refetchInterval === "number"
              ? options.refetchInterval
              : 5000,
          )
        : 15_000,
    refetchInterval:
      options?.refetchInterval !== undefined ? options.refetchInterval : 30_000,
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

// ─── Prometheus Source Hooks ──────────────────────────────────────────────────

export function usePrometheusSources() {
  return useQuery({
    queryKey: ["prometheus", "sources"],
    queryFn: () => prometheusService.listSources(),
    staleTime: 60_000,
  });
}

export function useCreatePrometheusSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PrometheusSourceCreate) =>
      prometheusService.createSource(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prometheus", "sources"] });
    },
  });
}

export function useUpdatePrometheusSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: PrometheusSourceUpdate }) =>
      prometheusService.updateSource(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prometheus", "sources"] });
    },
  });
}

export function useDeletePrometheusSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => prometheusService.deleteSource(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prometheus", "sources"] });
    },
  });
}

export function usePrometheusTargets(sourceId?: string) {
  return useQuery({
    queryKey: ["prometheus", "targets", sourceId],
    queryFn: () => prometheusService.listTargets(sourceId),
    staleTime: 30_000,
  });
}

export function usePrometheusJobs(sourceId?: string) {
  return useQuery({
    queryKey: ["prometheus", "jobs", sourceId],
    queryFn: () => prometheusService.listJobs(sourceId),
    staleTime: 60_000,
  });
}

export function usePrometheusOrigins(sourceId?: string) {
  return useQuery({
    queryKey: ["prometheus", "origins", sourceId],
    queryFn: () => prometheusService.listOrigins(sourceId),
    staleTime: 60_000,
  });
}

export function usePrometheusNodeTargets(sourceId?: string) {
  return useQuery({
    queryKey: ["prometheus", "node-targets", sourceId],
    queryFn: () => prometheusService.listNodeTargets(sourceId),
    staleTime: 30_000,
  });
}

export function useSyncVMs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      job?: string;
      origin_prometheus?: string;
      source_id?: string;
    }) => prometheusService.syncVms(params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.vms });
      qc.invalidateQueries({ queryKey: queryKeys.summary });
    },
  });
}

// ─── Alert Hooks ──────────────────────────────────────────────────────────────

export function useAlerts(
  vmId?: string,
  status?: string,
  options?: { refetchInterval?: number | false; enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.alerts(vmId, status),
    queryFn: () => alertService.list(vmId, status),
    enabled: options?.enabled !== false,
    staleTime:
      options?.refetchInterval !== undefined
        ? Math.min(
            5000,
            typeof options.refetchInterval === "number"
              ? options.refetchInterval
              : 5000,
          )
        : 15_000,
    refetchInterval:
      options?.enabled !== false
        ? options?.refetchInterval !== undefined
          ? options.refetchInterval
          : 30_000
        : false,
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

// ─── Forecast Overview Hooks ──────────────────────────────────────────────────

export function useForecastOverview(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["forecasts", "overview"],
    queryFn: () => forecastService.overview(),
    enabled: options?.enabled !== false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useActiveScan() {
  return useQuery({
    queryKey: ["forecasts", "scan", "active"],
    queryFn: () => forecastService.activeScan(),
    staleTime: 0,
    refetchInterval: false, // driven by WebSocket, not polling
  });
}

export function useVMRecommendation(
  id: string,
  algorithm: ForecastAlgorithm,
  periodDays: number,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["vms", id, "recommendation", algorithm, periodDays] as const,
    queryFn: () => vmService.recommendation(id, algorithm, periodDays),
    enabled: options?.enabled !== false && !!id,
    staleTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
