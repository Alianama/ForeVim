import type { ReportData, TopMetricEntry } from "./types";

export async function generateWord(data: ReportData): Promise<void> {
  const {
    Document,
    Packer,
    Paragraph,
    Table,
    TableRow,
    TableCell,
    TextRun,
    HeadingLevel,
    AlignmentType,
    BorderStyle,
    WidthType,
    ShadingType,
    Header,
    Footer,
    PageNumber,
  } = await import("docx");

  const PRIMARY = "3b82f6";
  const TEXT = "1e1e2e";
  const SUBTEXT = "6b7280";

  const headerRow = (cols: string[]) =>
    new TableRow({
      tableHeader: true,
      children: cols.map(
        (c) =>
          new TableCell({
            shading: { fill: PRIMARY, type: ShadingType.SOLID, color: PRIMARY },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: c,
                    bold: true,
                    color: "FFFFFF",
                    size: 18,
                  }),
                ],
              }),
            ],
            margins: { top: 80, bottom: 80, left: 80, right: 80 },
          }),
      ),
    });

  const dataRow = (vals: string[], shade = false) =>
    new TableRow({
      children: vals.map(
        (v) =>
          new TableCell({
            shading: shade
              ? { fill: "f8fafc", type: ShadingType.SOLID }
              : undefined,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: v || "-", size: 17, color: TEXT }),
                ],
              }),
            ],
            margins: { top: 60, bottom: 60, left: 80, right: 80 },
          }),
      ),
    });

  const section = (title: string) =>
    new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 120 },
    });

  const children: any[] = [
    new Paragraph({
      children: [
        new TextRun({ text: data.title, bold: true, size: 48, color: PRIMARY }),
      ],
      spacing: { after: 120 },
    }),
  ];
  if (data.subtitle) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: data.subtitle, size: 24, color: SUBTEXT }),
        ],
        spacing: { after: 80 },
      }),
    );
  }
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated: ${data.generatedAt.toLocaleString("id-ID")}`,
          size: 18,
          color: SUBTEXT,
        }),
      ],
      spacing: { after: 400 },
    }),
  );

  // Summary
  if (data.sections.includes("vm_summary") && data.summary) {
    children.push(section("Ringkasan VM"));
    const s = data.summary;
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          headerRow([
            "Total",
            "Healthy",
            "Warning",
            "Critical",
            "Unknown",
            "Down",
          ]),
          dataRow(
            [
              s.total_vms,
              s.healthy_vms,
              s.warning_vms,
              s.critical_vms,
              s.unknown_vms,
              s.down_vms,
            ].map(String),
          ),
        ],
      }),
    );
  }

  // VM List
  if (data.sections.includes("vm_list")) {
    children.push(section("Daftar VM & Metrik"));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          headerRow([
            "Hostname",
            "IP",
            "Env",
            "Status",
            "CPU%",
            "RAM%",
            "Disk%",
          ]),
          ...data.vmsWithMetrics.map((vm, i) =>
            dataRow(
              [
                vm.hostname,
                vm.ip_address,
                vm.environment,
                vm.status,
                vm.cpu_usage?.toFixed(1) ?? "-",
                vm.ram_usage?.toFixed(1) ?? "-",
                vm.disk_usage?.toFixed(1) ?? "-",
              ],
              i % 2 === 1,
            ),
          ),
        ],
      }),
    );
  }

  // Top metrics
  for (const [secId, entries, label] of [
    ["top_cpu", data.topCpu, "Top 10 CPU Usage"],
    ["top_ram", data.topRam, "Top 10 RAM Usage"],
    ["top_disk", data.topDisk, "Top 10 Disk Usage"],
  ] as [string, TopMetricEntry[], string][]) {
    if (!data.sections.includes(secId as any)) continue;
    children.push(section(label));
    children.push(
      new Table({
        width: { size: 60, type: WidthType.PERCENTAGE },
        rows: [
          headerRow(["Rank", "Hostname", "IP", "Nilai (%)", "Status"]),
          ...entries.map((e, i) =>
            dataRow(
              [
                String(e.rank),
                e.hostname,
                e.ip_address,
                e.value.toFixed(1),
                e.status,
              ],
              i % 2 === 1,
            ),
          ),
        ],
      }),
    );
  }

  // Forecast status
  if (data.sections.includes("forecast_status")) {
    children.push(section("Status Forecast"));
    const fmtF = (f: any) =>
      f
        ? `${f.algorithm.replace(/_/g, " ")}${f.is_expired ? " (expired)" : ""}`
        : "-";
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          headerRow(["Hostname", "IP", "CPU", "RAM", "Disk"]),
          ...data.forecastOverview.map((vm, i) =>
            dataRow(
              [
                vm.hostname,
                vm.ip_address,
                fmtF(vm.forecasts.cpu),
                fmtF(vm.forecasts.ram),
                fmtF(vm.forecasts.disk),
              ],
              i % 2 === 1,
            ),
          ),
        ],
      }),
    );
  }

  // Alerts
  if (data.sections.includes("alerts") && data.alerts.length > 0) {
    children.push(section("Active Alerts"));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          headerRow(["Severity", "Metric", "Pesan", "Nilai", "Dibuat"]),
          ...data.alerts.map((a, i) =>
            dataRow(
              [
                a.severity,
                a.metric,
                a.message,
                a.current_value?.toFixed(1) ?? "-",
                new Date(a.created_at).toLocaleDateString("id-ID"),
              ],
              i % 2 === 1,
            ),
          ),
        ],
      }),
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: data.title, color: SUBTEXT, size: 16 }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "ForeVim Report  |  Halaman " }),
                  new TextRun({ children: [PageNumber.CURRENT] }),
                  new TextRun({ text: " dari " }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES] }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBlob(doc);
  const url = URL.createObjectURL(buffer);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${data.title.replace(/\s+/g, "_")}_${data.generatedAt.toISOString().slice(0, 10)}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
