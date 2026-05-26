"use client";

import { useState } from "react";
import { FileSpreadsheet, FileText, Presentation, FileDown, Download, BarChart2, Server, Bell } from "lucide-react";
import { ReportBuilder } from "@/components/reports/ReportBuilder";

export default function ReportsPage() {
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [defaultTitle, setDefaultTitle] = useState("ForeVim Infrastructure Report");

  const quickReports = [
    {
      title: "VM Status Report",
      desc: "Ringkasan status dan metrik semua VM aktif",
      icon: Server,
      color: "bg-blue-500/10 text-blue-400",
      defaultTitle: "VM Status Report",
    },
    {
      title: "Forecast Overview",
      desc: "Status prediksi CPU/RAM/Disk semua VM",
      icon: BarChart2,
      color: "bg-violet-500/10 text-violet-400",
      defaultTitle: "Forecast Overview Report",
    },
    {
      title: "Alert Summary",
      desc: "Ringkasan alert aktif dan kritis",
      icon: Bell,
      color: "bg-rose-500/10 text-rose-400",
      defaultTitle: "Alert Summary Report",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Download className="w-6 h-6 text-primary" />
            Laporan & Ekspor
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Generate laporan monitoring dalam berbagai format file
          </p>
        </div>
        <button
          onClick={() => { setDefaultTitle("ForeVim Infrastructure Report"); setIsBuilderOpen(true); }}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-all"
        >
          <Download className="w-4 h-4" />
          Buat Laporan Baru
        </button>
      </div>

      {/* Format cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { fmt: "Excel", icon: FileSpreadsheet, color: "text-emerald-400 bg-emerald-500/10", ext: ".xlsx", desc: "Multi-sheet dengan data lengkap" },
          { fmt: "PDF", icon: FileText, color: "text-red-400 bg-red-500/10", ext: ".pdf", desc: "Dokumen dengan grafik & tabel" },
          { fmt: "PowerPoint", icon: Presentation, color: "text-orange-400 bg-orange-500/10", ext: ".pptx", desc: "Presentasi dengan chart" },
          { fmt: "Word", icon: FileText, color: "text-blue-400 bg-blue-500/10", ext: ".docx", desc: "Dokumen berformat" },
          { fmt: "CSV", icon: FileDown, color: "text-slate-400 bg-slate-500/10", ext: ".csv", desc: "Data mentah untuk analisis" },
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
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">LAPORAN CEPAT</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {quickReports.map(r => {
            const Icon = r.icon;
            return (
              <button
                key={r.title}
                onClick={() => { setDefaultTitle(r.defaultTitle); setIsBuilderOpen(true); }}
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

      {/* Feature info */}
      <div className="glass-card p-5 space-y-3">
        <h3 className="font-semibold text-sm">Tentang Fitur Laporan</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>✓ Export VM list dengan metrik CPU, RAM, Disk terkini</div>
          <div>✓ Top 10 VM berdasarkan penggunaan resource</div>
          <div>✓ Status forecast per VM (CPU/RAM/Disk)</div>
          <div>✓ Ringkasan alert aktif</div>
          <div>✓ Filter berdasarkan environment atau cluster</div>
          <div>✓ Grafik bar untuk PDF dan PowerPoint</div>
        </div>
      </div>

      <ReportBuilder
        isOpen={isBuilderOpen}
        onClose={() => setIsBuilderOpen(false)}
        defaultTitle={defaultTitle}
      />
    </div>
  );
}
