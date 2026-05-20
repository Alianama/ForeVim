/**
 * All TypeScript type definitions for the ForeVim frontend.
 */

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface User {
  id: string;
  email: string;
  username: string;
  full_name: string | null;
  role: "superadmin" | "admin" | "viewer";
  is_active: boolean;
  is_verified: boolean;
  last_login: string | null;
  created_at: string;
}

// ─── VM ───────────────────────────────────────────────────────────────────────

export type VMStatus = "healthy" | "warning" | "critical" | "unknown" | "down";

export interface VM {
  id: string;
  hostname: string;
  ip_address: string;
  description: string | null;
  location: string | null;
  environment: string;
  cluster: string | null;
  tags: string | null;
  status: VMStatus;
  prometheus_job: string;
  prometheus_instance: string | null;
  is_active: boolean;
  last_seen: string | null;
  created_at: string;
}

export interface VMListResponse {
  total: number;
  vms: VM[];
}

export interface VMCreate {
  hostname: string;
  ip_address: string;
  description?: string;
  location?: string;
  environment?: string;
  cluster?: string;
  tags?: string;
  prometheus_job?: string;
  prometheus_instance?: string;
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export interface VMMetrics {
  vm_id: string;
  hostname: string;
  cpu_usage: number | null;
  ram_usage: number | null;
  ram_total_gb: number | null;
  ram_used_gb: number | null;
  disk_usage: number | null;
  disk_total_gb: number | null;
  disk_used_gb: number | null;
  network_rx_mbps: number | null;
  network_tx_mbps: number | null;
  uptime_seconds: number | null;
  load_avg_1m: number | null;
  load_avg_5m: number | null;
  load_avg_15m: number | null;
  status: VMStatus;
  collected_at: string;
}

export interface MetricDataPoint {
  timestamp: string;
  value: number;
}

export interface VMHistoryResponse {
  vm_id: string;
  metric: string;
  step: string;
  data: MetricDataPoint[];
}

// ─── Forecast ─────────────────────────────────────────────────────────────────

export type ForecastMetric = "cpu" | "ram" | "disk";
export type ForecastAlgorithm =
  | "moving_average"
  | "linear_regression"
  | "prophet"
  | "arima"
  | "lstm";

export interface ForecastPoint {
  timestamp: string;
  value: number;
  lower_bound: number | null;
  upper_bound: number | null;
  is_forecast: boolean;
}

export interface ForecastResponse {
  vm_id: string;
  metric: ForecastMetric;
  algorithm: ForecastAlgorithm;
  period_days: number;
  historical: ForecastPoint[];
  forecast: ForecastPoint[];
  accuracy_score: number | null;
  generated_at: string;
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export type AlertSeverity = "info" | "warning" | "critical";
export type AlertStatus = "active" | "resolved" | "acknowledged";

export interface Alert {
  id: string;
  vm_id: string;
  severity: AlertSeverity;
  status: AlertStatus;
  metric: string;
  message: string;
  current_value: number | null;
  threshold_value: number | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardSummary {
  total_vms: number;
  healthy_vms: number;
  warning_vms: number;
  critical_vms: number;
  unknown_vms: number;
  down_vms: number;
  avg_cpu: number;
  avg_ram: number;
  avg_disk: number;
  active_alerts: number;
  critical_alerts: number;
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

export interface WSMessage<T = unknown> {
  event: string;
  data: T;
  timestamp: string;
}

export interface WSMetricsData {
  vm_id: string;
  hostname: string;
  cpu_usage: number | null;
  ram_usage: number | null;
  disk_usage: number | null;
  status: VMStatus;
  collected_at: string;
}

export interface WSAlertData {
  vm_id: string;
  hostname: string;
  severity: AlertSeverity;
  metric: string;
  message: string;
}
