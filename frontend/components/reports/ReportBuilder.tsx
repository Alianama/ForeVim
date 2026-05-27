"use client";

import { useState, useMemo } from "react";
import {
  useVMs,
  useForecastOverview,
  useAlerts,
  useDashboardSummary,
} from "@/hooks/useQueries";
import { useRealtimeStore } from "@/stores";
import {
  generateReport,
  DEFAULT_SECTIONS,
  type ReportFormat,
  type ReportSection,
  type ReportData,
  type VmWithMetrics,
  type TopMetricEntry,
} from "@/lib/reports";
import {
  FileSpreadsheet,
  FileText,
  Presentation,
  FileDown,
  X,
  Download,
  Loader2,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultTitle?: string;
}

const FORMAT_OPTIONS: {
  id: ReportFormat;
  label: string;
  desc: string;
  icon: React.ComponentType<any>;
  color: string;
}[] = [
  {
    id: "xlsx",
    label: "Excel",
    desc: ".xlsx — multi-sheet with full tables",
    icon: FileSpreadsheet,
    color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
  },
  {
    id: "pdf",
    label: "PDF",
    desc: ".pdf — print-ready document with charts",
    icon: FileText,
    color: "text-red-500 bg-red-500/10 border-red-500/30",
  },
  {
    id: "pptx",
    label: "PowerPoint",
    desc: ".pptx — presentation with interactive charts",
    icon: Presentation,
    color: "text-orange-500 bg-orange-500/10 border-orange-500/30",
  },
  {
    id: "docx",
    label: "Word",
    desc: ".docx — formatted document with tables",
    icon: FileText,
    color: "text-blue-500 bg-blue-500/10 border-blue-500/30",
  },
  {
    id: "csv",
    label: "CSV",
    desc: ".csv — raw data for advanced analysis",
    icon: FileDown,
    color: "text-slate-500 bg-slate-500/10 border-slate-500/30",
  },
];

export function ReportBuilder({
  isOpen,
  onClose,
  defaultTitle = "ForeVim Report",
}: Props) {
  const [title, setTitle] = useState(defaultTitle);
  const [subtitle, setSubtitle] = useState("");
  const [format, setFormat] = useState<ReportFormat>("pdf");
  const [sections, setSections] = useState<ReportSection[]>(
    DEFAULT_SECTIONS.map((s: ReportSection) => ({ ...s })),
  );
  const [includeCharts, setIncludeCharts] = useState(true);
  const [filterEnv, setFilterEnv] = useState("all");
  const [filterCluster, setFilterCluster] = useState("all");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { data: vmsData } = useVMs();
  const { data: forecastOverview = [] } = useForecastOverview();
  const { data: alerts = [] } = useAlerts(undefined, "active");
  const { data: summary } = useDashboardSummary();
  const realtimeMetrics = useRealtimeStore((s) => s.metrics);

  const allVms = vmsData?.vms ?? [];

  // Get unique environments and clusters for filter dropdowns
  const environments = useMemo(
    () => ["all", ...new Set(allVms.map((v) => v.environment).filter(Boolean))],
    [allVms],
  );
  const clusters = useMemo(
    () => [
      "all",
      ...new Set(allVms.map((v) => v.cluster).filter((c): c is string => !!c)),
    ],
    [allVms],
  );

  // Filtered VMs
  const filteredVms = useMemo(() => {
    return allVms.filter((vm) => {
      if (filterEnv !== "all" && vm.environment !== filterEnv) return false;
      if (filterCluster !== "all" && vm.cluster !== filterCluster) return false;
      return true;
    });
  }, [allVms, filterEnv, filterCluster]);

  const toggleSection = (id: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
    );
  };

  const toggleAll = (enabled: boolean) => {
    setSections((prev) => prev.map((s) => ({ ...s, enabled })));
  };

  const buildReportData = (): ReportData => {
    // Build vmsWithMetrics
    const vmsWithMetrics: VmWithMetrics[] = filteredVms.map((vm) => {
      const rt = realtimeMetrics[vm.id];
      return {
        ...vm,
        cpu_usage: rt?.cpu_usage ?? null,
        ram_usage: rt?.ram_usage ?? null,
        disk_usage: rt?.disk_usage ?? null,
        ram_used_gb: rt?.ram_used_gb ?? null,
        ram_total_gb: rt?.ram_total_gb ?? null,
        disk_used_gb: rt?.disk_used_gb ?? null,
        disk_total_gb: rt?.disk_total_gb ?? null,
      };
    });

    // Build top metrics (top 10, sorted desc, only those with values)
    const buildTop = (
      metric: "cpu_usage" | "ram_usage" | "disk_usage",
    ): TopMetricEntry[] =>
      vmsWithMetrics
        .filter((vm) => vm[metric] !== null)
        .sort((a, b) => (b[metric] ?? 0) - (a[metric] ?? 0))
        .slice(0, 10)
        .map((vm, i) => ({
          rank: i + 1,
          hostname: vm.hostname,
          ip_address: vm.ip_address,
          value: vm[metric] ?? 0,
          status: vm.status,
        }));

    const enabledSections = sections.filter((s) => s.enabled).map((s) => s.id);

    return {
      title,
      subtitle,
      generatedAt: new Date(),
      sections: enabledSections,
      includeCharts: includeCharts && format !== "csv" && format !== "docx",
      vmsWithMetrics,
      summary: summary ?? null,
      topCpu: buildTop("cpu_usage"),
      topRam: buildTop("ram_usage"),
      topDisk: buildTop("disk_usage"),
      forecastOverview:
        filterEnv !== "all" || filterCluster !== "all"
          ? forecastOverview.filter((vm) => {
              const match = filteredVms.find((v) => v.id === vm.vm_id);
              return !!match;
            })
          : forecastOverview,
      alerts,
    };
  };

  const handleGenerate = async () => {
    if (!title.trim()) {
      toast.error("Report title is required");
      return;
    }
    if (!sections.some((s) => s.enabled)) {
      toast.error("Select at least one section");
      return;
    }

    setIsGenerating(true);
    try {
      const reportData = buildReportData();
      await generateReport(reportData, format);
      toast.success(`Report successfully created and downloaded!`);
      onClose();
    } catch (err: any) {
      console.error("Report generation error:", err);
      toast.error(`Failed to create report: ${err?.message ?? "Unknown error"}`);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  const activeFormat = FORMAT_OPTIONS.find((f) => f.id === format)!;
  const allEnabled = sections.every((s) => s.enabled);
  const someEnabled = sections.some((s) => s.enabled);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Download className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold">Generate Report</h2>
              <p className="text-xs text-muted-foreground">
                Export monitoring data to various formats
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body — scrollable */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {/* Title & Subtitle */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  REPORT TITLE *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Example: VM Monitoring Report — January 2025"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  SUBTITLE (optional)
                </label>
                <input
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="Example: Production Infrastructure Q1 2025"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                />
              </div>
            </div>

            {/* Format Selector */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-2">
                FILE FORMAT
              </label>
              <div className="grid grid-cols-5 gap-2">
                {FORMAT_OPTIONS.map((f) => {
                  const Icon = f.icon;
                  const active = format === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setFormat(f.id)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                        active
                          ? `${f.color} border-2`
                          : "border-border bg-background hover:bg-secondary"
                      }`}
                    >
                      <Icon
                        className={`w-6 h-6 ${active ? "" : "text-muted-foreground"}`}
                      />
                      <span
                        className={`text-xs font-semibold ${active ? "" : "text-muted-foreground"}`}
                      >
                        {f.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {activeFormat.desc}
              </p>
            </div>

            {/* Sections */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  REPORT CONTENT
                </label>
                <button
                  onClick={() => toggleAll(!allEnabled)}
                  className="text-xs text-primary hover:underline"
                >
                  {allEnabled ? "Deselect all" : "Select all"}
                </button>
              </div>
              <div className="space-y-1.5 bg-secondary/30 rounded-xl p-3">
                {sections.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => toggleSection(s.id)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary transition-colors text-left"
                  >
                    {s.enabled ? (
                      <CheckSquare className="w-4 h-4 text-primary shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-sm font-medium ${s.enabled ? "text-foreground" : "text-muted-foreground"}`}
                      >
                        {s.label}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {s.description}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Charts toggle (only for PDF and PPTX) */}
            {(format === "pdf" || format === "pptx") && (
              <div className="flex items-center justify-between py-3 px-4 bg-secondary/30 rounded-xl">
                <div>
                  <div className="text-sm font-medium">Include Charts</div>
                  <div className="text-xs text-muted-foreground">
                    Add bar charts for Top CPU/RAM/Disk
                  </div>
                </div>
                <button
                  onClick={() => setIncludeCharts((v) => !v)}
                  className={`w-12 h-6 rounded-full transition-colors ${includeCharts ? "bg-primary" : "bg-secondary border border-border"}`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${includeCharts ? "translate-x-6" : "translate-x-0"}`}
                  />
                </button>
              </div>
            )}

            {/* Advanced filters */}
            <div>
              <button
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAdvanced ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
                ADVANCED FILTERS
              </button>
              {showAdvanced && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">
                      Environment
                    </label>
                    <Select value={filterEnv} onValueChange={setFilterEnv}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {environments.map((e) => (
                          <SelectItem key={e} value={e}>
                            {e === "all" ? "All" : e}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">
                      Cluster
                    </label>
                    <Select value={filterCluster} onValueChange={setFilterCluster}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {clusters.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c === "all" ? "All" : c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {/* Preview info */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs text-muted-foreground space-y-1">
              <div className="font-semibold text-foreground text-sm">
                Preview
              </div>
              <div>
                {filteredVms.length} VMs{" "}
                {filterEnv !== "all" || filterCluster !== "all"
                  ? "(filtered)"
                  : "(all)"}
              </div>
              <div>
                {sections.filter((s) => s.enabled).length} of{" "}
                {sections.length} sections active
              </div>
              <div>
                Format:{" "}
                <span className="font-semibold text-foreground">
                  {activeFormat.label} ({activeFormat.id.toUpperCase()})
                </span>
              </div>
              {(format === "pdf" || format === "pptx") && (
                <div>Charts: {includeCharts ? "Included" : "Table only"}</div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border shrink-0">
            <p className="text-xs text-muted-foreground">
              {filteredVms.length} VMs ·{" "}
              {sections.filter((s) => s.enabled).length} sections
            </p>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-all border border-border"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !someEnabled || !title.trim()}
                className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {isGenerating ? "Generating report…" : "Generate & Download"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
