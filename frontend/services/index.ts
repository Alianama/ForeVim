/**
 * API service layer — all backend calls go through here.
 */
import api from "@/lib/api-client";
import type { NotificationConfig } from "@/types";
import {
  Alert,
  DashboardSummary,
  DiskMount,
  ForecastAlgorithm,
  ForecastMetric,
  ForecastOverviewItem,
  ForecastResponse,
  ForecastHistoryItem,
  LoginRequest,
  TokenResponse,
  LoginResponse,
  RecommendationResponse,
  User,
  VM,
  VMCreate,
  VMHistoryResponse,
  VMListResponse,
  VMMetrics,
  PrometheusSource,
  PrometheusSourceCreate,
  PrometheusSourceUpdate,
} from "@/types";

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authService = {
  login: async (creds: LoginRequest): Promise<LoginResponse> => {
    const { data } = await api.post<LoginResponse>("/auth/login/json", creds);
    return data;
  },
  me: async (): Promise<User> => {
    const { data } = await api.get<User>("/auth/me");
    return data;
  },
  refresh: async (refreshToken: string): Promise<TokenResponse> => {
    const { data } = await api.post<TokenResponse>("/auth/refresh", {
      refresh_token: refreshToken,
    });
    return data;
  },
  verify2fa: async (
    mfa_token: string,
    code: string,
  ): Promise<TokenResponse> => {
    const { data } = await api.post<TokenResponse>("/auth/verify-2fa", {
      mfa_token,
      code,
    });
    return data;
  },
  setup2fa: async (): Promise<{ secret: string; provisioning_uri: string }> => {
    const { data } = await api.post<{
      secret: string;
      provisioning_uri: string;
    }>("/auth/2fa/setup");
    return data;
  },
  enable2fa: async (code: string): Promise<{ message: string }> => {
    const { data } = await api.post<{ message: string }>("/auth/2fa/enable", {
      code,
    });
    return data;
  },
  disable2fa: async (code: string): Promise<{ message: string }> => {
    const { data } = await api.post<{ message: string }>("/auth/2fa/disable", {
      code,
    });
    return data;
  },
};

// ─── VMs ─────────────────────────────────────────────────────────────────────

export const vmService = {
  list: async (skip = 0, limit = 500): Promise<VMListResponse> => {
    const { data } = await api.get<VMListResponse>("/vms", {
      params: { skip, limit },
    });
    return data;
  },
  get: async (id: string): Promise<VM> => {
    const { data } = await api.get<VM>(`/vms/${id}`);
    return data;
  },
  create: async (body: VMCreate): Promise<VM> => {
    const { data } = await api.post<VM>("/vms", body);
    return data;
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`/vms/${id}`);
  },
  metrics: async (id: string): Promise<VMMetrics> => {
    const { data } = await api.get<VMMetrics>(`/vms/${id}/metrics`);
    return data;
  },
  history: async (
    id: string,
    metric: string,
    hours: number,
    step: string,
  ): Promise<VMHistoryResponse> => {
    const { data } = await api.get<VMHistoryResponse>(`/vms/${id}/history`, {
      params: { metric, hours, step },
    });
    return data;
  },
  forecast: async (
    id: string,
    metric: ForecastMetric,
    algorithm: ForecastAlgorithm,
    periodDays: number,
    forceRefresh = false,
  ): Promise<ForecastResponse> => {
    const { data } = await api.get<ForecastResponse>(`/vms/${id}/forecast`, {
      params: {
        metric,
        algorithm,
        period_days: periodDays,
        force_refresh: forceRefresh,
      },
    });
    return data;
  },
  generateForecast: async (
    id: string,
    metric: ForecastMetric,
    algorithm: ForecastAlgorithm,
    periodDays: number,
  ): Promise<ForecastResponse> => {
    const { data } = await api.post<ForecastResponse>(
      `/vms/${id}/forecast/generate`,
      null,
      {
        params: { metric, algorithm, period_days: periodDays },
      },
    );
    return data;
  },
  forecastHistory: async (
    id: string,
    limit = 20,
  ): Promise<ForecastHistoryItem[]> => {
    const { data } = await api.get<ForecastHistoryItem[]>(
      `/vms/${id}/forecast/history`,
      {
        params: { limit },
      },
    );
    return data;
  },
  recommendation: async (
    id: string,
    algorithm: ForecastAlgorithm = "auto",
    periodDays: number = 7,
  ): Promise<RecommendationResponse> => {
    const { data } = await api.get<RecommendationResponse>(
      `/vms/${id}/recommendation`,
      {
        params: { algorithm, period_days: periodDays },
      },
    );
    return data;
  },
  summary: async (): Promise<DashboardSummary> => {
    const { data } = await api.get<DashboardSummary>("/vms/summary");
    return data;
  },
  diskMounts: async (id: string): Promise<DiskMount[]> => {
    const { data } = await api.get<DiskMount[]>(`/vms/${id}/disk-mounts`);
    return data;
  },
};

// ─── Alerts ───────────────────────────────────────────────────────────────────

export const alertService = {
  list: async (vmId?: string, status?: string): Promise<Alert[]> => {
    const { data } = await api.get<Alert[]>("/alerts", {
      params: { vm_id: vmId, alert_status: status, limit: 100 },
    });
    return data;
  },
  acknowledge: async (id: string): Promise<Alert> => {
    const { data } = await api.post<Alert>(`/alerts/${id}/acknowledge`, {});
    return data;
  },
  resolve: async (id: string): Promise<Alert> => {
    const { data } = await api.post<Alert>(`/alerts/${id}/resolve`, {});
    return data;
  },
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const userService = {
  list: async (): Promise<User[]> => {
    const { data } = await api.get<User[]>("/users");
    return data;
  },
  create: async (body: any): Promise<User> => {
    const { data } = await api.post<User>("/users", body);
    return data;
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`/users/${id}`);
  },
};

// ─── Prometheus ────────────────────────────────────────────────────────────────

export const prometheusService = {
  retention: async (sourceId?: string): Promise<{ retention_days: number }> => {
    const { data } = await api.get<{ retention_days: number }>(
      "/prometheus/retention",
      {
        params: { source_id: sourceId },
      },
    );
    return data;
  },
  listSources: async (): Promise<PrometheusSource[]> => {
    const { data } = await api.get<PrometheusSource[]>("/prometheus/sources");
    return data;
  },
  createSource: async (
    body: PrometheusSourceCreate,
  ): Promise<PrometheusSource> => {
    const { data } = await api.post<PrometheusSource>(
      "/prometheus/sources",
      body,
    );
    return data;
  },
  updateSource: async (
    id: string,
    body: PrometheusSourceUpdate,
  ): Promise<PrometheusSource> => {
    const { data } = await api.patch<PrometheusSource>(
      `/prometheus/sources/${id}`,
      body,
    );
    return data;
  },
  deleteSource: async (id: string): Promise<void> => {
    await api.delete(`/prometheus/sources/${id}`);
  },
  listTargets: async (sourceId?: string): Promise<any> => {
    const { data } = await api.get<any>("/prometheus/targets", {
      params: { source_id: sourceId },
    });
    return data;
  },
  listJobs: async (sourceId?: string): Promise<string[]> => {
    const { data } = await api.get<string[]>("/prometheus/jobs", {
      params: { source_id: sourceId },
    });
    return data;
  },
  listOrigins: async (sourceId?: string): Promise<string[]> => {
    const { data } = await api.get<string[]>("/prometheus/origins", {
      params: { source_id: sourceId },
    });
    return data;
  },
  listNodeTargets: async (sourceId?: string): Promise<any> => {
    const { data } = await api.get<any>("/prometheus/node-targets", {
      params: { source_id: sourceId },
    });
    return data;
  },
  syncVms: async (params: {
    job?: string;
    origin_prometheus?: string;
    source_id?: string;
  }): Promise<any> => {
    const { data } = await api.post<any>("/prometheus/sync-vms", null, {
      params: {
        job: params.job,
        origin_prometheus: params.origin_prometheus,
        source_id: params.source_id,
      },
    });
    return data;
  },
};

// ─── Forecast ─────────────────────────────────────────────────────────────────

export const forecastService = {
  overview: async (): Promise<ForecastOverviewItem[]> => {
    const { data } = await api.get<ForecastOverviewItem[]>(
      "/forecasts/overview",
    );
    return data;
  },
  activeScan: async (): Promise<{
    is_running: boolean;
    scan_id?: string;
    total?: number;
    completed?: number;
  }> => {
    const { data } = await api.get("/forecasts/scan/active");
    return data;
  },
  startScan: async (body: {
    algorithm: string;
    period_days: number;
    vm_ids?: string[];
  }): Promise<{ scan_id: string; total: number; vm_count: number }> => {
    const { data } = await api.post("/forecasts/scan", body);
    return data;
  },
};

// ─── Notification Config ────────────────────────────────────────────────────────

export const notificationService = {
  getConfig: async (): Promise<NotificationConfig> => {
    const { data } = await api.get<NotificationConfig>("/notification-config");
    return data;
  },
  updateConfig: async (body: Partial<NotificationConfig>): Promise<NotificationConfig> => {
    const { data } = await api.put<NotificationConfig>("/notification-config", body);
    return data;
  },
  testTelegram: async (message?: string): Promise<{ success: boolean; message: string }> => {
    const { data } = await api.post("/notification-config/test-telegram", { message });
    return data;
  },
  testEmail: async (message?: string): Promise<{ success: boolean; message: string }> => {
    const { data } = await api.post("/notification-config/test-email", { message });
    return data;
  },
};

