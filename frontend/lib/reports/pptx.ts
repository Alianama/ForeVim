import type { ReportData, TopMetricEntry } from "./types";

const THEME = {
  primary: "3b82f6",
  success: "10b981",
  warning: "f59e0b",
  danger: "ef4444",
  text: "1e1e2e",
  subtext: "6b7280",
  bg: "f8fafc",
  white: "ffffff",
};

export async function generatePPTX(data: ReportData): Promise<void> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";

  const W = 13.33,
    H = 7.5; // inches for LAYOUT_WIDE

  // ── Helper: slide master ────────────────────────────────────────────────────
  function addSlideHeader(slide: any, title: string) {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: W,
      h: 0.7,
      fill: { color: THEME.primary },
    });
    slide.addText(title, {
      x: 0.3,
      y: 0,
      w: W - 3,
      h: 0.7,
      fontSize: 20,
      bold: true,
      color: THEME.white,
      valign: "middle",
    });
    slide.addText(data.title, {
      x: W - 2.7,
      y: 0,
      w: 2.5,
      h: 0.7,
      fontSize: 9,
      color: THEME.white,
      valign: "middle",
      align: "right",
    });
  }

  function addSlideFooter(slide: any) {
    slide.addText(data.generatedAt.toLocaleString("id-ID"), {
      x: 0.3,
      y: H - 0.3,
      w: 6,
      h: 0.3,
      fontSize: 8,
      color: THEME.subtext,
    });
    slide.addText("ForeVim \u2014 VM Monitoring & Forecasting", {
      x: 7,
      y: H - 0.3,
      w: 6,
      h: 0.3,
      fontSize: 8,
      color: THEME.subtext,
      align: "right",
    });
  }

  // ── Slide 1: Title ──────────────────────────────────────────────────────────
  {
    const slide = pptx.addSlide();
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: W,
      h: H,
      fill: { color: THEME.primary },
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: H * 0.55,
      w: W,
      h: H * 0.45,
      fill: { color: "1e3a5f" },
    });
    slide.addText(data.title, {
      x: 0.8,
      y: 1.5,
      w: W - 1.6,
      h: 1.5,
      fontSize: 36,
      bold: true,
      color: THEME.white,
      align: "center",
    });
    if (data.subtitle) {
      slide.addText(data.subtitle, {
        x: 0.8,
        y: 3.2,
        w: W - 1.6,
        h: 0.8,
        fontSize: 18,
        color: "cbd5e1",
        align: "center",
      });
    }
    slide.addText(`Generated: ${data.generatedAt.toLocaleString("id-ID")}`, {
      x: 0.8,
      y: H - 1.2,
      w: W - 1.6,
      h: 0.5,
      fontSize: 12,
      color: "94a3b8",
      align: "center",
    });
  }

  // ── Slide 2: VM Summary ─────────────────────────────────────────────────────
  if (data.sections.includes("vm_summary") && data.summary) {
    const slide = pptx.addSlide();
    addSlideHeader(slide, "Ringkasan VM");
    const s = data.summary;
    const stats = [
      { label: "Total", value: s.total_vms, color: THEME.primary },
      { label: "Healthy", value: s.healthy_vms, color: THEME.success },
      { label: "Warning", value: s.warning_vms, color: THEME.warning },
      { label: "Critical", value: s.critical_vms, color: THEME.danger },
      { label: "Unknown", value: s.unknown_vms, color: THEME.subtext },
      { label: "Down", value: s.down_vms, color: THEME.danger },
    ];
    const boxW = 1.9,
      boxH = 1.5,
      startX = 0.4,
      startY = 1.1;
    stats.forEach((st, i) => {
      const x = startX + i * (boxW + 0.25);
      slide.addShape(pptx.ShapeType.roundRect, {
        x,
        y: startY,
        w: boxW,
        h: boxH,
        fill: { color: "f1f5f9" },
        line: { color: st.color, width: 2 },
        rectRadius: 0.1,
      });
      slide.addText(String(st.value), {
        x,
        y: startY + 0.15,
        w: boxW,
        h: 0.8,
        fontSize: 32,
        bold: true,
        color: st.color,
        align: "center",
      });
      slide.addText(st.label, {
        x,
        y: startY + 0.95,
        w: boxW,
        h: 0.4,
        fontSize: 12,
        color: THEME.subtext,
        align: "center",
      });
    });
    // Avg metrics text
    slide.addText(
      `Rata-rata: CPU ${s.avg_cpu?.toFixed(1) ?? "-"}%  |  RAM ${s.avg_ram?.toFixed(1) ?? "-"}%  |  Disk ${s.avg_disk?.toFixed(1) ?? "-"}%  |  Active Alerts: ${s.active_alerts}`,
      {
        x: 0.4,
        y: 3.2,
        w: W - 0.8,
        h: 0.5,
        fontSize: 13,
        color: THEME.subtext,
        align: "center",
      },
    );
    addSlideFooter(slide);
  }

  // ── Top Metrics Charts ──────────────────────────────────────────────────────
  for (const [secId, entries, label, color] of [
    ["top_cpu", data.topCpu, "Top 10 CPU Usage", THEME.primary],
    ["top_ram", data.topRam, "Top 10 RAM Usage", THEME.success],
    ["top_disk", data.topDisk, "Top 10 Disk Usage", THEME.warning],
  ] as [string, TopMetricEntry[], string, string][]) {
    if (!data.sections.includes(secId as any) || entries.length === 0) continue;
    const slide = pptx.addSlide();
    addSlideHeader(slide, label);

    if (data.includeCharts) {
      const chartData = [
        {
          name: "Usage (%)",
          labels: entries.map(
            (e) => `${e.hostname.substring(0, 14)} (${e.ip_address})`,
          ),
          values: entries.map((e) => parseFloat(e.value.toFixed(1))),
        },
      ];
      slide.addChart(pptx.ChartType.bar, chartData, {
        x: 0.3,
        y: 0.8,
        w: 8.5,
        h: 5.8,
        barDir: "bar",
        showValue: true,
        dataLabelFontSize: 9,
        chartColors: [color],
        valAxisMaxVal: 100,
        catAxisLabelColor: THEME.text,
        catAxisLabelFontSize: 9,
        valAxisLineShow: false,
        showLegend: false,
      });
      // Table on the right
      const rows: any[] = [
        [
          { text: "Rank", options: { bold: true } },
          { text: "Hostname", options: { bold: true } },
          { text: "Usage%", options: { bold: true } },
        ],
        ...entries.map((e) => [
          String(e.rank),
          e.hostname.substring(0, 16),
          `${e.value.toFixed(1)}%`,
        ]),
      ];
      slide.addTable(rows, {
        x: 9.1,
        y: 0.9,
        w: 3.9,
        h: 5.6,
        fontSize: 9,
        border: { pt: 0.5, color: "e2e8f0" },
        align: "left",
      });
    } else {
      // Table only - wider
      const rows: any[] = [
        [
          { text: "Rank", options: { bold: true } },
          { text: "Hostname", options: { bold: true } },
          { text: "IP", options: { bold: true } },
          { text: "Usage (%)", options: { bold: true } },
          { text: "Status", options: { bold: true } },
        ],
        ...entries.map((e) => [
          String(e.rank),
          e.hostname,
          e.ip_address,
          `${e.value.toFixed(1)}%`,
          e.status,
        ]),
      ];
      slide.addTable(rows, {
        x: 0.5,
        y: 0.85,
        w: 12,
        h: 6,
        fontSize: 10,
        border: { pt: 0.5, color: "e2e8f0" },
        align: "left",
      });
    }
    addSlideFooter(slide);
  }

  // ── Forecast Status ─────────────────────────────────────────────────────────
  if (
    data.sections.includes("forecast_status") &&
    data.forecastOverview.length > 0
  ) {
    const slide = pptx.addSlide();
    addSlideHeader(slide, "Status Forecast per VM");
    const fmtF = (f: any) =>
      f
        ? `${f.algorithm.replace(/_/g, " ")}${f.is_expired ? " \u26a0" : " \u2713"}`
        : "-";
    const rows: any[] = [
      [
        { text: "Hostname", options: { bold: true } },
        { text: "IP", options: { bold: true } },
        { text: "CPU", options: { bold: true } },
        { text: "RAM", options: { bold: true } },
        { text: "Disk", options: { bold: true } },
      ],
      ...data.forecastOverview
        .slice(0, 20)
        .map((vm) => [
          vm.hostname.substring(0, 20),
          vm.ip_address,
          fmtF(vm.forecasts.cpu),
          fmtF(vm.forecasts.ram),
          fmtF(vm.forecasts.disk),
        ]),
    ];
    slide.addTable(rows, {
      x: 0.5,
      y: 0.85,
      w: 12.3,
      h: 6,
      fontSize: 9.5,
      border: { pt: 0.5, color: "e2e8f0" },
      align: "left",
      rowH: 0.32,
    });
    addSlideFooter(slide);
  }

  // ── Alerts ──────────────────────────────────────────────────────────────────
  if (data.sections.includes("alerts") && data.alerts.length > 0) {
    const slide = pptx.addSlide();
    addSlideHeader(slide, "Active Alerts");
    const rows: any[] = [
      [
        { text: "Severity", options: { bold: true } },
        { text: "Metric", options: { bold: true } },
        { text: "Pesan", options: { bold: true } },
        { text: "Nilai", options: { bold: true } },
        { text: "Dibuat", options: { bold: true } },
      ],
      ...data.alerts
        .slice(0, 18)
        .map((a) => [
          a.severity.toUpperCase(),
          a.metric,
          a.message.substring(0, 45),
          a.current_value?.toFixed(1) ?? "-",
          new Date(a.created_at).toLocaleDateString("id-ID"),
        ]),
    ];
    slide.addTable(rows, {
      x: 0.5,
      y: 0.85,
      w: 12.3,
      h: 6,
      fontSize: 9.5,
      border: { pt: 0.5, color: "e2e8f0" },
      align: "left",
      rowH: 0.35,
    });
    addSlideFooter(slide);
  }

  // Download
  await pptx.writeFile({
    fileName: `${data.title.replace(/\s+/g, "_")}_${data.generatedAt.toISOString().slice(0, 10)}.pptx`,
  });
}
