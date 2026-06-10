import type { ReportData } from "./types";

export function generateCSV(data: ReportData): void {
  const rows: string[][] = [];

  // Header
  rows.push([`# ${data.title}`]);
  rows.push([`# Generated: ${data.generatedAt.toLocaleString("id-ID")}`]);
  rows.push([]);

  if (data.sections.includes("vm_summary") && data.summary) {
    rows.push(["## VM Summary"]);
    rows.push(["Total", "Healthy", "Warning", "Critical", "Unknown", "Down"]);
    const s = data.summary;
    rows.push([s.total_vms, s.healthy_vms, s.warning_vms, s.critical_vms, s.unknown_vms, s.down_vms].map(String));
    rows.push([]);
  }

  if (data.sections.includes("vm_list")) {
    rows.push(["## VM List"]);
    rows.push(["Hostname", "IP", "Environment", "Cluster", "Status", "CPU (%)", "RAM (%)", "Disk (%)", "RAM Used (GB)", "RAM Total (GB)", "Last Seen"]);
    for (const vm of data.vmsWithMetrics) {
      rows.push([
        vm.hostname,
        vm.ip_address,
        vm.environment,
        vm.cluster ?? "",
        vm.status,
        vm.cpu_usage?.toFixed(1) ?? "",
        vm.ram_usage?.toFixed(1) ?? "",
        vm.disk_usage?.toFixed(1) ?? "",
        vm.ram_used_gb?.toFixed(1) ?? "",
        vm.ram_total_gb?.toFixed(1) ?? "",
        vm.last_seen ? new Date(vm.last_seen).toLocaleString("id-ID") : "",
      ]);
    }
    rows.push([]);
  }

  for (const [section, metric, label] of [
    ["top_cpu", "topCpu", "Top 10 CPU Usage"],
    ["top_ram", "topRam", "Top 10 RAM Usage"],
    ["top_disk", "topDisk", "Top 10 Disk Usage"],
  ] as [string, keyof ReportData, string][]) {
    if (data.sections.includes(section as any)) {
      rows.push([`## ${label}`]);
      rows.push(["Rank", "Hostname", "IP", "Value (%)", "Status"]);
      for (const entry of data[metric] as any[]) {
        rows.push([entry.rank, entry.hostname, entry.ip_address, entry.value.toFixed(1), entry.status].map(String));
      }
      rows.push([]);
    }
  }

  // ── Forecast Status — full detail ──────────────────────────────────────────
  if (data.sections.includes("forecast_status")) {
    rows.push(["## Forecast Status"]);
    rows.push([
      "Hostname", "IP", "Cluster", "Has Prometheus",
      // CPU
      "CPU Algoritma", "CPU Periode (hari)", "CPU MAPE (%)", "CPU Aksi", "CPU Kapasitas Saat Ini", "CPU Kapasitas Rekomendasi", "CPU Alasan", "CPU Expired?", "CPU Dibuat",
      // RAM
      "RAM Algoritma", "RAM Periode (hari)", "RAM MAPE (%)", "RAM Aksi", "RAM Kapasitas Saat Ini", "RAM Kapasitas Rekomendasi", "RAM Alasan", "RAM Expired?", "RAM Dibuat",
      // Disk
      "Disk Algoritma", "Disk Periode (hari)", "Disk MAPE (%)", "Disk Aksi", "Disk Kapasitas Saat Ini", "Disk Kapasitas Rekomendasi", "Disk Alasan", "Disk Expired?", "Disk Dibuat",
    ]);

    const fmtForecast = (f: any, metricName: string) => {
      if (!f) return ["", "", "", "", "", "", "", "", ""];
      const unit = metricName === "cpu" ? " Cores" : " GB";
      const rec = f.recommendation;
      return [
        f.algorithm ?? "",
        String(f.period_days ?? ""),
        f.accuracy_score != null ? f.accuracy_score.toFixed(1) : "",
        rec?.action ?? "",
        rec?.current_capacity != null ? `${rec.current_capacity.toFixed(1)}${unit}` : "",
        rec?.recommended_capacity != null ? `${rec.recommended_capacity.toFixed(1)}${unit}` : "",
        rec?.reason ?? "",
        f.is_expired ? "Ya" : "Tidak",
        f.generated_at ? new Date(f.generated_at).toLocaleString("id-ID") : "",
      ];
    };

    for (const vm of data.forecastOverview) {
      rows.push([
        vm.hostname,
        vm.ip_address,
        vm.cluster ?? "",
        vm.has_prometheus ? "Ya" : "Tidak",
        ...fmtForecast(vm.forecasts?.cpu, "cpu"),
        ...fmtForecast(vm.forecasts?.ram, "ram"),
        ...fmtForecast(vm.forecasts?.disk, "disk"),
      ]);
    }
    rows.push([]);
  }

  if (data.sections.includes("alerts")) {
    rows.push(["## Active Alerts"]);
    rows.push(["VM ID", "Severity", "Metric", "Message", "Value", "Created At"]);
    for (const a of data.alerts) {
      rows.push([a.vm_id, a.severity, a.metric, a.message, a.current_value?.toFixed(1) ?? "", new Date(a.created_at).toLocaleString("id-ID")]);
    }
  }

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `${data.title.replace(/\s+/g, "_")}_${formatDate(data.generatedAt)}.csv`);
}

function formatDate(d: Date) { return d.toISOString().slice(0, 10); }
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/**
 * Separate CSV export for VMs with status "down" (shutdown).
 * This is a standalone export — always CSV regardless of the selected report format.
 */
export function generateShutdownCSV(data: ReportData): void {
  const rows: string[][] = [];

  rows.push([`# Shutdown VMs Export — ${data.title}`]);
  rows.push([`# Generated: ${data.generatedAt.toLocaleString("id-ID")}`]);
  rows.push([`# Total Shutdown VMs: ${data.shutdownVms.length}`]);
  rows.push([]);

  if (data.shutdownVms.length === 0) {
    rows.push(["No shutdown VMs found."]);
  } else {
    rows.push([
      "No.",
      "Hostname",
      "IP Address",
      "Environment",
      "Cluster",
      "Location",
      "Last Seen",
    ]);
    data.shutdownVms.forEach((vm, idx) => {
      rows.push([
        String(idx + 1),
        vm.hostname,
        vm.ip_address,
        vm.environment ?? "",
        vm.cluster ?? "",
        vm.location ?? "",
        vm.last_seen ? new Date(vm.last_seen).toLocaleString("id-ID") : "-",
      ]);
    });
  }

  const csv = rows
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `Shutdown_VMs_${formatDate(data.generatedAt)}.csv`);
}

