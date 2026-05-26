import type { ReportData, TopMetricEntry } from "./types";

// Colors
const COLORS = {
  primary: [59, 130, 246] as [number, number, number],
  success: [16, 185, 129] as [number, number, number],
  warning: [245, 158, 11] as [number, number, number],
  danger: [239, 68, 68] as [number, number, number],
  text: [30, 30, 30] as [number, number, number],
  subtext: [100, 100, 100] as [number, number, number],
  bg: [248, 250, 252] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
};

function statusColor(status: string): [number, number, number] {
  if (status === "healthy") return COLORS.success;
  if (status === "warning") return COLORS.warning;
  if (status === "critical" || status === "down") return COLORS.danger;
  return COLORS.subtext;
}

function metricColor(value: number): [number, number, number] {
  if (value >= 85) return COLORS.danger;
  if (value >= 70) return COLORS.warning;
  return COLORS.success;
}

export async function generatePDF(data: ReportData): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  await import("jspdf-autotable");

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297;
  const margin = 15;
  let y = 0;

  // ── Helper: add page header bar ──────────────────────────────────────────────
  function addHeader(isFirst = false) {
    pdf.setFillColor(...COLORS.primary);
    pdf.rect(0, 0, W, isFirst ? 40 : 12, "F");
    if (isFirst) {
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(22);
      pdf.setFont("helvetica", "bold");
      pdf.text(data.title, margin, 18);
      if (data.subtitle) {
        pdf.setFontSize(11);
        pdf.setFont("helvetica", "normal");
        pdf.text(data.subtitle, margin, 27);
      }
      pdf.setFontSize(9);
      pdf.text(`Generated: ${data.generatedAt.toLocaleString("id-ID")}`, margin, 35);
    } else {
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.text(data.title, margin, 8);
      pdf.text(data.generatedAt.toLocaleDateString("id-ID"), W - margin, 8, { align: "right" });
    }
    pdf.setTextColor(...COLORS.text);
  }

  // ── Helper: section title ──────────────────────────────────────────────────────
  function sectionTitle(title: string, currentY: number): number {
    if (currentY > H - 50) { pdf.addPage(); addHeader(); currentY = 20; }
    pdf.setFillColor(...COLORS.bg);
    pdf.rect(margin, currentY, W - margin * 2, 8, "F");
    pdf.setDrawColor(...COLORS.border);
    pdf.rect(margin, currentY, W - margin * 2, 8, "S");
    pdf.setTextColor(...COLORS.primary);
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "bold");
    pdf.text(title, margin + 3, currentY + 5.5);
    pdf.setTextColor(...COLORS.text);
    pdf.setFont("helvetica", "normal");
    return currentY + 12;
  }

  // ── Helper: draw horizontal mini bar ──────────────────────────────────────────
  function drawBar(x: number, y: number, value: number, maxW: number, barH: number) {
    const [r, g, b] = metricColor(value);
    const fillW = Math.max(2, (value / 100) * maxW);
    pdf.setFillColor(230, 236, 245);
    pdf.roundedRect(x, y, maxW, barH, 1, 1, "F");
    pdf.setFillColor(r, g, b);
    pdf.roundedRect(x, y, fillW, barH, 1, 1, "F");
    pdf.setTextColor(...COLORS.text);
    pdf.setFontSize(7.5);
    pdf.text(`${value.toFixed(1)}%`, x + maxW + 2, y + barH - 1);
  }

  // ── Page 1: Title + Summary ────────────────────────────────────────────────────
  addHeader(true);
  y = 50;

  if (data.sections.includes("vm_summary") && data.summary) {
    y = sectionTitle("Ringkasan VM", y);
    const s = data.summary;
    const stats = [
      { label: "Total", value: s.total_vms, color: COLORS.primary },
      { label: "Healthy", value: s.healthy_vms, color: COLORS.success },
      { label: "Warning", value: s.warning_vms, color: COLORS.warning },
      { label: "Critical", value: s.critical_vms, color: COLORS.danger },
      { label: "Unknown", value: s.unknown_vms, color: COLORS.subtext },
      { label: "Down", value: s.down_vms, color: COLORS.danger },
    ];
    const boxW = (W - margin * 2) / stats.length - 2;
    stats.forEach((stat, i) => {
      const bx = margin + i * (boxW + 2);
      pdf.setFillColor(248, 250, 252);
      pdf.roundedRect(bx, y, boxW, 16, 2, 2, "F");
      pdf.setDrawColor(...stat.color);
      pdf.roundedRect(bx, y, boxW, 16, 2, 2, "S");
      pdf.setTextColor(...stat.color);
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.text(String(stat.value), bx + boxW / 2, y + 9, { align: "center" });
      pdf.setFontSize(7);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(...COLORS.subtext);
      pdf.text(stat.label, bx + boxW / 2, y + 13.5, { align: "center" });
    });
    y += 22;

    // Avg metrics
    pdf.setFontSize(9);
    pdf.setTextColor(...COLORS.subtext);
    pdf.text(`Rata-rata CPU: ${s.avg_cpu?.toFixed(1) ?? "-"}%  |  RAM: ${s.avg_ram?.toFixed(1) ?? "-"}%  |  Disk: ${s.avg_disk?.toFixed(1) ?? "-"}%  |  Active Alerts: ${s.active_alerts}`, margin, y);
    y += 8;
  }

  // ── VM List Table ───────────────────────────────────────────────────────────────
  if (data.sections.includes("vm_list")) {
    y = sectionTitle("Daftar VM & Metrik Terkini", y);
    (pdf as any).autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Hostname", "IP", "Env", "Status", "CPU%", "RAM%", "Disk%", "Last Seen"]],
      body: data.vmsWithMetrics.map(vm => [
        vm.hostname,
        vm.ip_address,
        vm.environment,
        vm.status,
        vm.cpu_usage?.toFixed(1) ?? "-",
        vm.ram_usage?.toFixed(1) ?? "-",
        vm.disk_usage?.toFixed(1) ?? "-",
        vm.last_seen ? new Date(vm.last_seen).toLocaleDateString("id-ID") : "-",
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        3: { cellWidth: 16 },
        4: { cellWidth: 12, halign: "right" },
        5: { cellWidth: 12, halign: "right" },
        6: { cellWidth: 12, halign: "right" },
        7: { cellWidth: 22 },
      },
      didParseCell: (hookData: any) => {
        if (hookData.column.index === 3 && hookData.section === "body") {
          const [r, g, b] = statusColor(hookData.cell.text[0]);
          hookData.cell.styles.textColor = [r, g, b];
          hookData.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = (pdf as any).lastAutoTable.finalY + 8;
  }

  // ── Top Metrics ─────────────────────────────────────────────────────────────────
  for (const [secId, entries, label, barColor] of [
    ["top_cpu", data.topCpu, "Top 10 CPU Usage", COLORS.primary],
    ["top_ram", data.topRam, "Top 10 RAM Usage", COLORS.success],
    ["top_disk", data.topDisk, "Top 10 Disk Usage", COLORS.warning],
  ] as [string, TopMetricEntry[], string, [number, number, number]][]) {
    if (!data.sections.includes(secId as any)) continue;

    if (y > H - 80) { pdf.addPage(); addHeader(); y = 20; }
    y = sectionTitle(label, y);

    if (data.includeCharts) {
      // Draw horizontal bar chart
      const chartX = margin, chartW = 120, barH = 6, barGap = 2;
      const labelW = 38;
      const labelX = chartX, barX = chartX + labelW;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const rowY = y + i * (barH + barGap);
        // Rank + hostname
        pdf.setFontSize(7.5);
        pdf.setTextColor(...COLORS.subtext);
        pdf.text(`${e.rank}. ${e.hostname.substring(0, 16)}`, labelX, rowY + barH - 1);
        // Bar
        drawBar(barX, rowY, e.value, chartW, barH);
      }
      y += entries.length * (barH + barGap) + 4;
    }

    (pdf as any).autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Rank", "Hostname", "IP Address", "Nilai (%)", "Status"]],
      body: entries.map(e => [e.rank, e.hostname, e.ip_address, e.value.toFixed(1), e.status]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: barColor, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { cellWidth: 12, halign: "center" }, 3: { halign: "right" } },
    });
    y = (pdf as any).lastAutoTable.finalY + 8;
  }

  // ── Forecast Status ─────────────────────────────────────────────────────────────
  if (data.sections.includes("forecast_status")) {
    if (y > H - 60) { pdf.addPage(); addHeader(); y = 20; }
    y = sectionTitle("Status Forecast per VM", y);
    const fmtF = (f: any) => f ? `${f.algorithm.replace(/_/g, " ")}${f.is_expired ? " \u26a0" : " \u2713"}` : "-";
    (pdf as any).autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Hostname", "IP", "CPU", "RAM", "Disk"]],
      body: data.forecastOverview.map(vm => [
        vm.hostname, vm.ip_address, fmtF(vm.forecasts.cpu), fmtF(vm.forecasts.ram), fmtF(vm.forecasts.disk),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    y = (pdf as any).lastAutoTable.finalY + 8;
  }

  // ── Alerts ──────────────────────────────────────────────────────────────────────
  if (data.sections.includes("alerts") && data.alerts.length > 0) {
    if (y > H - 60) { pdf.addPage(); addHeader(); y = 20; }
    y = sectionTitle("Active Alerts", y);
    (pdf as any).autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Severity", "Metric", "Pesan", "Nilai", "Dibuat"]],
      body: data.alerts.map(a => [
        a.severity, a.metric, a.message.substring(0, 50),
        a.current_value?.toFixed(1) ?? "-",
        new Date(a.created_at).toLocaleDateString("id-ID"),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: COLORS.danger, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: (hookData: any) => {
        if (hookData.column.index === 0 && hookData.section === "body") {
          const [r, g, b] = statusColor(hookData.cell.text[0]);
          hookData.cell.styles.textColor = [r, g, b];
          hookData.cell.styles.fontStyle = "bold";
        }
      },
    });
  }

  // ── Footer on each page ─────────────────────────────────────────────────────────
  const pageCount = (pdf as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setDrawColor(...COLORS.border);
    pdf.line(margin, H - 10, W - margin, H - 10);
    pdf.setFontSize(7);
    pdf.setTextColor(...COLORS.subtext);
    pdf.text(`ForeVim Report \u2014 ${data.title}`, margin, H - 6);
    pdf.text(`Halaman ${i} dari ${pageCount}`, W - margin, H - 6, { align: "right" });
  }

  const filename = `${data.title.replace(/\s+/g, "_")}_${data.generatedAt.toISOString().slice(0, 10)}.pdf`;
  pdf.save(filename);
}
