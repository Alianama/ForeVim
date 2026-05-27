"use client";

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";
import { Cpu, MemoryStick, HardDrive } from "lucide-react";
import type { VMMetrics, VMStatus } from "@/types";

type TopMetricTab = "cpu" | "ram" | "disk";

interface TopEntry {
  hostname: string;
  ip_address: string;
  value: number | null;
  status: VMStatus;
  sub?: string;
}

const METRIC_COLORS: Record<TopMetricTab, string> = {
  cpu: "#3b82f6",
  ram: "#10b981",
  disk: "#f59e0b",
};

const STATUS_BAR_COLORS: Record<string, string> = {
  critical: "#ef4444",
  warning: "#f59e0b",
  healthy: "#10b981",
  unknown: "#6b7280",
  down: "#ef4444",
};

interface Props {
  vms: { id: string; hostname: string; ip_address: string }[];
  metrics: Record<
    string,
    Partial<
      Pick<VMMetrics, "cpu_usage" | "ram_usage" | "disk_usage" | "disk_used_gb" | "disk_total_gb" | "status">
    >
  >;
}

export function TopMetricsPanel({ vms, metrics }: Props) {
  const [activeMetric, setActiveMetric] = useState<TopMetricTab>("cpu");

  const metricKey: Record<
    TopMetricTab,
    "cpu_usage" | "ram_usage" | "disk_usage"
  > = {
    cpu: "cpu_usage",
    ram: "ram_usage",
    disk: "disk_usage",
  };

  const topEntries: TopEntry[] = useMemo(() => {
    const key = metricKey[activeMetric];
    return vms
      .map((vm) => {
        const m = metrics[vm.id] ?? {};
        let val = m[key] as number | null | undefined;
        if (activeMetric === "disk") {
          const used = parseFloat(String(m.disk_used_gb ?? 0));
          const total = parseFloat(String(m.disk_total_gb ?? 0));
          if (isFinite(used) && isFinite(total) && total > 0) {
            val = (used / total) * 100;
          }
        }
        return {
          hostname: vm.hostname,
          ip_address: vm.ip_address,
          value: (typeof val === "number" && isFinite(val)) ? val : null,
          status: m.status ?? "unknown",
          sub:
            activeMetric === "disk" && m.disk_used_gb != null && m.disk_total_gb != null
              ? `${m.disk_used_gb} / ${m.disk_total_gb} GB`
              : undefined,
        };
      })
      .filter((e) => e.value !== null || e.sub !== undefined)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      .slice(0, 10);
  }, [vms, metrics, activeMetric]);

  const tabs: {
    id: TopMetricTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: "cpu", label: "CPU", icon: Cpu },
    { id: "ram", label: "RAM", icon: MemoryStick },
    { id: "disk", label: "Disk", icon: HardDrive },
  ];

  const color = METRIC_COLORS[activeMetric];

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border/50">
        <span className="text-sm font-semibold">Top Resource Usage</span>
        <span className="text-xs text-muted-foreground hidden md:block">
          10 VM With Most High Resource Usage
        </span>
        <div className="ml-auto flex gap-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveMetric(id)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                activeMetric === id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {topEntries.length === 0 ? (
          <div className="col-span-2 flex items-center justify-center h-32 text-muted-foreground text-sm">
            Belum ada data real-time. Tunggu WebSocket atau cek koneksi
            Prometheus.
          </div>
        ) : (
          <>
            <ResponsiveContainer
              width="100%"
              height={Math.max(160, topEntries.length * 36)}
            >
              <BarChart
                data={topEntries}
                layout="vertical"
                margin={{ top: 0, right: 44, left: 0, bottom: 0 }}
              >
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tickCount={6}
                  unit="%"
                  tick={{ fontSize: 10 }}
                />
                <YAxis
                  type="category"
                  dataKey="hostname"
                  width={110}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: string) =>
                    v.length > 14 ? v.slice(0, 14) + "…" : v
                  }
                />
                <Tooltip
                  formatter={(v: number) => [
                    `${v.toFixed(1)}%`,
                    activeMetric.toUpperCase(),
                  ]}
                  labelStyle={{ fontSize: 11 }}
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {topEntries.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={STATUS_BAR_COLORS[entry.status] ?? color}
                      opacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-1.5 pr-2 text-muted-foreground font-medium w-6">#</th>
                    <th className="text-left py-1.5 pr-2 text-muted-foreground font-medium">Hostname</th>
                    <th className="text-left py-1.5 pr-2 text-muted-foreground font-medium hidden md:table-cell">IP</th>
                    <th className="text-right py-1.5 text-muted-foreground font-medium">Usage</th>
                    {activeMetric === "disk" && (
                      <th className="text-right py-1.5 text-muted-foreground font-medium hidden md:table-cell">Disk (GB)</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {topEntries.map((e, i) => {
                    const textColor =
                      e.status === "critical" || e.status === "down"
                        ? "text-red-400"
                        : e.status === "warning"
                          ? "text-amber-400"
                          : "text-emerald-400";
                    return (
                      <tr
                        key={i}
                        className="border-b border-border/30 hover:bg-secondary/30 transition-colors"
                      >
                        <td className="py-1.5 pr-2 text-muted-foreground">
                          {i + 1}
                        </td>
                        <td className="text-left py-1.5 pr-2 font-medium">
                          {e.hostname}
                        </td>
                        <td className="text-left py-1.5 pr-2 font-mono text-muted-foreground hidden md:table-cell">
                          {e.ip_address}
                        </td>
                        <td className="text-right py-1.5">
                           <span className={`font-semibold tabular-nums ${textColor}`}>{e.value !== null ? `${e.value.toFixed(1)}%` : "—"}</span>
                        </td>
                        {activeMetric === "disk" && (
                           <td className="text-right py-1.5 hidden md:table-cell">
                             <span className="text-xs text-muted-foreground">{e.sub ?? "—"}</span>
                           </td>
                         )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
