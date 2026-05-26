import type { VM, VMMetrics, ForecastOverviewItem, Alert, DashboardSummary } from "@/types";

export type ReportFormat = "xlsx" | "pdf" | "pptx" | "csv" | "docx";

export type ReportSectionId =
  | "vm_summary"
  | "vm_list"
  | "top_cpu"
  | "top_ram"
  | "top_disk"
  | "forecast_status"
  | "alerts";

export interface ReportSection {
  id: ReportSectionId;
  label: string;
  description: string;
  enabled: boolean;
}

export const DEFAULT_SECTIONS: ReportSection[] = [
  { id: "vm_summary", label: "Ringkasan VM", description: "Jumlah VM per status", enabled: true },
  { id: "vm_list", label: "Daftar VM & Metrik", description: "Semua VM dengan penggunaan CPU/RAM/Disk terkini", enabled: true },
  { id: "top_cpu", label: "Top 10 CPU", description: "VM dengan penggunaan CPU tertinggi", enabled: true },
  { id: "top_ram", label: "Top 10 RAM", description: "VM dengan penggunaan RAM tertinggi", enabled: true },
  { id: "top_disk", label: "Top 10 Disk", description: "VM dengan penggunaan Disk tertinggi", enabled: true },
  { id: "forecast_status", label: "Status Forecast", description: "Status prediksi CPU/RAM/Disk per VM", enabled: true },
  { id: "alerts", label: "Active Alerts", description: "Alert aktif saat ini", enabled: true },
];

export interface VmWithMetrics extends VM {
  cpu_usage: number | null;
  ram_usage: number | null;
  disk_usage: number | null;
  ram_used_gb: number | null;
  ram_total_gb: number | null;
  disk_used_gb: number | null;
  disk_total_gb: number | null;
}

export interface TopMetricEntry {
  rank: number;
  hostname: string;
  ip_address: string;
  value: number;
  status: string;
}

export interface ReportData {
  title: string;
  subtitle: string;
  generatedAt: Date;
  sections: ReportSectionId[];
  includeCharts: boolean;
  vmsWithMetrics: VmWithMetrics[];
  summary: DashboardSummary | null;
  topCpu: TopMetricEntry[];
  topRam: TopMetricEntry[];
  topDisk: TopMetricEntry[];
  forecastOverview: ForecastOverviewItem[];
  alerts: Alert[];
}

export interface ReportConfig {
  title: string;
  subtitle: string;
  sections: ReportSection[];
  format: ReportFormat;
  includeCharts: boolean;
  filterEnvironment: string; // "all" or specific
  filterCluster: string; // "all" or specific
}
