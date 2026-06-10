"use client";

import { useState } from "react";
import { FileSpreadsheet, FileText, Presentation, FileDown, Download, BarChart2, Server, Bell, PowerOff, Loader2 } from "lucide-react";
import { ReportBuilder } from "@/components/reports/ReportBuilder";
import { useVMs } from "@/hooks/useQueries";
import { useRealtimeStore } from "@/stores";
import { generateShutdownCSV } from "@/lib/reports";
import type { VmWithMetrics, ReportSectionId } from "@/lib/reports";
import { toast } from "sonner";

export default function ReportsPage() {
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [defaultTitle, setDefaultTitle] = useState("ForeVim Infrastructure Report");
  const [defaultSections, setDefaultSections] = useState<ReportSectionId[] | undefined>(undefined);
  const [isExportingShutdown, setIsExportingShutdown] = useState(false);

  const { data: vmsData } = useVMs();
  const realtimeMetrics = useRealtimeStore((s) => s.metrics);

  const allVms = vmsData?.vms ?? [];
  const shutdownCount = allVms.filter((v) => v.status === "down").length;

  const handleExportShutdownDirect = () => {
    setIsExportingShutdown(true);
    try {
      const downVms = allVms.filter((v) => v.status === "down");
      if (downVms.length === 0) {
        toast.info("No shutdown VMs found.");
        return;
      }
      const shutdownVms: VmWithMetrics[] = downVms.map((vm) => {
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
      generateShutdownCSV({
        title: "ForeVim Infrastructure Report",
        subtitle: "",
        generatedAt: new Date(),
        sections: [],
        includeCharts: false,
        vmsWithMetrics: [],
        shutdownVms,
        summary: null,
        topCpu: [],
        topRam: [],
        topDisk: [],
        forecastOverview: [],
        alerts: [],
      });
      toast.success(`${downVms.length} shutdown VMs exported as CSV!`);
    } catch (err: any) {
      toast.error(`Export failed: ${err?.message ?? "Unknown error"}`);
    } finally {
      setIsExportingShutdown(false);
    }
  };

  const quickReports = [
    {
      title: "VM Status Report",
      desc: "Status and metrics summary for all active VMs",
      icon: Server,
      color: "bg-blue-500/10 text-blue-400",
      defaultTitle: "VM Status Report",
      sections: ["vm_summary", "vm_list", "top_cpu", "top_ram", "top_disk"] as ReportSectionId[],
    },
    {
      title: "Forecast Overview",
      desc: "CPU/RAM/Disk forecast status for all VMs",
      icon: BarChart2,
      color: "bg-violet-500/10 text-violet-400",
      defaultTitle: "Forecast Overview Report",
      sections: ["vm_summary", "forecast_status"] as ReportSectionId[],
    },
    {
      title: "Alert Summary",
      desc: "Summary of active and critical alerts",
      icon: Bell,
      color: "bg-rose-500/10 text-rose-400",
      defaultTitle: "Alert Summary Report",
      sections: ["vm_summary", "alerts"] as ReportSectionId[],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Download className="w-6 h-6 text-primary" />
            Reports &amp; Export
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Generate monitoring reports in various file formats
          </p>
        </div>
        <button
          onClick={() => {
            setDefaultTitle("ForeVim Infrastructure Report");
            setDefaultSections(undefined);
            setIsBuilderOpen(true);
          }}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-all"
        >
          <Download className="w-4 h-4" />
          Create New Report
        </button>
      </div>

      {/* Format cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { fmt: "Excel", icon: FileSpreadsheet, color: "text-emerald-400 bg-emerald-500/10", ext: ".xlsx", desc: "Multi-sheet with complete data" },
          { fmt: "PDF", icon: FileText, color: "text-red-400 bg-red-500/10", ext: ".pdf", desc: "Document with charts & tables" },
          { fmt: "PowerPoint", icon: Presentation, color: "text-orange-400 bg-orange-500/10", ext: ".pptx", desc: "Presentation with charts" },
          { fmt: "Word", icon: FileText, color: "text-blue-400 bg-blue-500/10", ext: ".docx", desc: "Formatted document" },
          { fmt: "CSV", icon: FileDown, color: "text-slate-400 bg-slate-500/10", ext: ".csv", desc: "Raw data for analysis" },
        ].map(f => {
          const Icon = f.icon;
          return (
            <div key={f.fmt} className="glass-card p-4 flex flex-col gap-2">
              <div className={`w-10 h-10 rounded-lg ${f.color} flex items-center justify-center`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="font-semibold text-sm">{f.fmt}</div>
              <div className="text-[11px] text-muted-foreground">{f.desc}</div>
              <div className="text-[10px] font-mono text-muted-foreground/50">{f.ext}</div>
            </div>
          );
        })}
      </div>

      {/* Quick Reports */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">QUICK REPORTS</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {quickReports.map(r => {
            const Icon = r.icon;
            return (
              <button
                key={r.title}
                onClick={() => {
                  setDefaultTitle(r.defaultTitle);
                  setDefaultSections(r.sections);
                  setIsBuilderOpen(true);
                }}
                className="glass-card p-5 flex items-start gap-4 hover:ring-1 hover:ring-primary/30 transition-all text-left"
              >
                <div className={`w-10 h-10 rounded-lg ${r.color} flex items-center justify-center shrink-0`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-sm">{r.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{r.desc}</div>
                </div>
                <Download className="w-4 h-4 text-muted-foreground ml-auto mt-1 shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Shutdown VMs Export */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">SEPARATE EXPORTS</h2>
        <button
          onClick={handleExportShutdownDirect}
          disabled={isExportingShutdown}
          className="w-full glass-card p-5 flex items-start gap-4 hover:ring-1 hover:ring-amber-500/30 transition-all text-left disabled:opacity-60"
        >
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
            {isExportingShutdown ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <PowerOff className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm flex items-center gap-2">
              Export Shutdown VMs
              {shutdownCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold">
                  {shutdownCount}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Daftar semua VM yang berstatus shutdown/down — diekspor sebagai CSV terpisah
            </div>
          </div>
          <FileDown className="w-4 h-4 text-amber-400 ml-auto mt-1 shrink-0" />
        </button>
      </div>

      {/* Feature info */}
      <div className="glass-card p-5 space-y-3">
        <h3 className="font-semibold text-sm">About Reports Feature</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>✓ Export VM list with latest CPU, RAM, Disk metrics</div>
          <div>✓ Top 10 VMs based on resource utilization</div>
          <div>✓ Forecast status per VM (CPU/RAM/Disk)</div>
          <div>✓ Summary of active alerts</div>
          <div>✓ Filter by environment or cluster</div>
          <div>✓ Bar charts for PDF and PowerPoint</div>
          <div>✓ Shutdown VMs excluded from main report</div>
          <div>✓ Dedicated Shutdown VM CSV export</div>
        </div>
      </div>

      <ReportBuilder
        isOpen={isBuilderOpen}
        onClose={() => setIsBuilderOpen(false)}
        defaultTitle={defaultTitle}
        defaultSections={defaultSections}
      />
    </div>
  );
}
