/**
 * API service layer — all backend calls go through here.
 */
import api from "@/lib/api-client";
import {
  Alert,
  DashboardSummary,
  ForecastAlgorithm,
  ForecastMetric,
  ForecastResponse,
  LoginRequest,
  TokenResponse,
  User,
  VM,
  VMCreate,
  VMHistoryResponse,
  VMListResponse,
  VMMetrics,
} from "@/types";

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authService = {
  login: async (creds: LoginRequest): Promise<TokenResponse> => {
    const { data } = await api.post<TokenResponse>("/auth/login/json", creds);
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
};

// ─── VMs ─────────────────────────────────────────────────────────────────────

export const vmService = {
  list: async (skip = 0, limit = 100): Promise<VMListResponse> => {
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
    step: string
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
    periodDays: number
  ): Promise<ForecastResponse> => {
    const { data } = await api.get<ForecastResponse>(`/vms/${id}/forecast`, {
      params: { metric, algorithm, period_days: periodDays },
    });
    return data;
  },
  summary: async (): Promise<DashboardSummary> => {
    const { data } = await api.get<DashboardSummary>("/vms/summary");
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
  retention: async (): Promise<{ retention_days: number }> => {
    const { data } = await api.get<{ retention_days: number }>("/prometheus/retention");
    return data;
  },
};

