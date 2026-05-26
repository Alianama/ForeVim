import type { ReportData } from "./types";

export async function generateExcel(data: ReportData): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const headerStyle = { font: { bold: true, sz: 11 } };

  // ── Sheet 1: Summary ───────────────────────────────────────────────────────
  if (data.sections.includes("vm_summary")) {
    const s = data.summary;
    const rows = [
      [data.title],
      [`Generated: ${data.generatedAt.toLocaleString("id-ID")}`],
      [],
      ["VM Summary"],
      ["Total VMs", "Healthy", "Warning", "Critical", "Unknown", "Down"],
      s ? [s.total_vms, s.healthy_vms, s.warning_vms, s.critical_vms, s.unknown_vms, s.down_vms] : [],
      [],
      s ? ["Avg CPU (%)", "Avg RAM (%)", "Avg Disk (%)"] : [],
      s ? [s.avg_cpu?.toFixed(1), s.avg_ram?.toFixed(1), s.avg_disk?.toFixed(1)] : [],
    ].filter(r => r !== null) as any[][];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, "Ringkasan");
  }

  // ── Sheet 2: VM List ────────────────────────────────────────────────────────
  if (data.sections.includes("vm_list")) {
    const headers = ["Hostname", "IP Address", "Environment", "Cluster", "Location", "Status", "CPU (%)", "RAM (%)", "Disk (%)", "RAM Used (GB)", "RAM Total (GB)", "Disk Used (GB)", "Disk Total (GB)", "Last Seen"];
    const rows = [headers, ...data.vmsWithMetrics.map(vm => [
      vm.hostname, vm.ip_address, vm.environment, vm.cluster ?? "-", vm.location ?? "-",
      vm.status, vm.cpu_usage?.toFixed(1) ?? "-", vm.ram_usage?.toFixed(1) ?? "-",
      vm.disk_usage?.toFixed(1) ?? "-", vm.ram_used_gb?.toFixed(1) ?? "-",
      vm.ram_total_gb?.toFixed(1) ?? "-", vm.disk_used_gb?.toFixed(1) ?? "-",
      vm.disk_total_gb?.toFixed(1) ?? "-",
      vm.last_seen ? new Date(vm.last_seen).toLocaleString("id-ID") : "-",
    ])];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 20 }];
    // Bold header row
    for (let c = 0; c < headers.length; c++) {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[cellRef]) ws[cellRef].s = headerStyle;
    }
    XLSX.utils.book_append_sheet(wb, ws, "Daftar VM");
  }

  // ── Sheet 3: Top Metrics ────────────────────────────────────────────────────
  const topData: any[][] = [];
  for (const [key, label] of [["topCpu", "Top 10 CPU (%)"], ["topRam", "Top 10 RAM (%)"], ["topDisk", "Top 10 Disk (%)"]] as [keyof ReportData, string][]) {
    const sectionId = key === "topCpu" ? "top_cpu" : key === "topRam" ? "top_ram" : "top_disk";
    if (data.sections.includes(sectionId as any)) {
      topData.push([label]);
      topData.push(["Rank", "Hostname", "IP", "Value (%)", "Status"]);
      for (const e of data[key] as any[]) {
        topData.push([e.rank, e.hostname, e.ip_address, e.value.toFixed(1), e.status]);
      }
      topData.push([]);
    }
  }
  if (topData.length > 0) {
    const ws = XLSX.utils.aoa_to_sheet(topData);
    ws["!cols"] = [{ wch: 6 }, { wch: 20 }, { wch: 15 }, { wch: 10 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, "Top Metrik");
  }

  // ── Sheet 4: Forecast Status ─────────────────────────────────────────────────
  if (data.sections.includes("forecast_status")) {
    const headers = ["Hostname", "IP", "Has Prometheus", "CPU Algoritma", "CPU Terakhir", "CPU MAPE (%)", "CPU Expired?", "RAM Algoritma", "RAM Terakhir", "RAM MAPE (%)", "RAM Expired?", "Disk Algoritma", "Disk Terakhir", "Disk MAPE (%)", "Disk Expired?"];
    const fmtF = (f: any) => f ? [f.algorithm.replace(/_/g, " "), new Date(f.generated_at).toLocaleString("id-ID"), f.accuracy_score?.toFixed(1) ?? "-", f.is_expired ? "Ya" : "Tidak"] : ["-", "-", "-", "-"];
    const rows = [headers, ...data.forecastOverview.map(vm => [
      vm.hostname, vm.ip_address, vm.has_prometheus ? "Ya" : "Tidak",
      ...fmtF(vm.forecasts.cpu), ...fmtF(vm.forecasts.ram), ...fmtF(vm.forecasts.disk),
    ])];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, "Forecast");
  }

  // ── Sheet 5: Alerts ──────────────────────────────────────────────────────────
  if (data.sections.includes("alerts") && data.alerts.length > 0) {
    const headers = ["VM ID", "Severity", "Status", "Metric", "Message", "Nilai Saat Ini", "Threshold", "Dibuat"];
    const rows = [headers, ...data.alerts.map(a => [
      a.vm_id, a.severity, a.status, a.metric, a.message,
      a.current_value?.toFixed(2) ?? "-", a.threshold_value?.toFixed(2) ?? "-",
      new Date(a.created_at).toLocaleString("id-ID"),
    ])];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 36 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 40 }, { wch: 14 }, { wch: 10 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, "Alerts");
  }

  // Write and download
  const filename = `${data.title.replace(/\s+/g, "_")}_${data.generatedAt.toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}
