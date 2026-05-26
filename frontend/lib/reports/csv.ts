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

  if (data.sections.includes("forecast_status")) {
    rows.push(["## Forecast Status"]);
    rows.push(["Hostname", "IP", "CPU Algorithm", "CPU Last Run", "CPU MAPE", "RAM Algorithm", "RAM Last Run", "RAM MAPE", "Disk Algorithm", "Disk Last Run", "Disk MAPE"]);
    for (const vm of data.forecastOverview) {
      const fmtForecast = (f: any) => f ? [f.algorithm, new Date(f.generated_at).toLocaleString("id-ID"), f.accuracy_score?.toFixed(1) ?? ""] : ["", "", ""];
      rows.push([
        vm.hostname,
        vm.ip_address,
        ...fmtForecast(vm.forecasts.cpu),
        ...fmtForecast(vm.forecasts.ram),
        ...fmtForecast(vm.forecasts.disk),
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
