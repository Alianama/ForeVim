"use client";

import { Cpu, HardDrive, MemoryStick, Clock, Activity, Wifi } from "lucide-react";
import type { VM, VMMetrics } from "@/types";
import { useRealtimeStore } from "@/stores";
import { formatDistanceToNow } from "date-fns";

interface Props {
  vm: VM;
  metrics?: VMMetrics;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  unit,
  sub,
  color,
}: {
  icon: React.ComponentType<any>;
  label: string;
  value: number | null;
  unit?: string;
  sub?: string;
  color: string;
}) {
  const level =
    value === null
      ? "none"
      : value >= 85
      ? "high"
      : value >= 70
      ? "medium"
      : "low";

  return (
    <div className="glass-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>

      <div>
        {value === null ? (
          <span className="text-2xl font-bold text-muted-foreground">—</span>
        ) : (
          <span
            className={`text-2xl font-bold tabular-nums ${
              level === "high"
                ? "text-red-400"
                : level === "medium"
                ? "text-amber-400"
                : "text-foreground"
            }`}
          >
            {value.toFixed(1)}
            <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>
          </span>
        )}
        {sub && <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>}
      </div>

      {value !== null && (
        <div className="progress-bar">
          <div
            className={`progress-fill ${level}`}
            style={{ width: `${Math.min(value, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function MetricsOverviewCards({ vm, metrics }: Props) {
  const rt = useRealtimeStore((s) => s.metrics[vm.id]);
  const m = rt ? { ...metrics, ...rt } : metrics;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <MetricCard
        icon={Cpu}
        label="CPU Usage"
        value={m?.cpu_usage ?? null}
        unit="%"
        color="bg-blue-500/15 text-blue-400"
      />
      <MetricCard
        icon={MemoryStick}
        label="RAM Usage"
        value={m?.ram_usage ?? null}
        unit="%"
        sub={m?.ram_used_gb ? `${m.ram_used_gb} / ${m.ram_total_gb} GB` : undefined}
        color="bg-emerald-500/15 text-emerald-400"
      />
      <MetricCard
        icon={HardDrive}
        label="Disk Usage"
        value={m?.disk_usage ?? null}
        unit="%"
        sub={m?.disk_used_gb ? `${m.disk_used_gb} / ${m.disk_total_gb} GB` : undefined}
        color="bg-amber-500/15 text-amber-400"
      />
      <MetricCard
        icon={Activity}
        label="Load Avg"
        value={m?.load_avg_1m ?? null}
        unit=""
        sub={m?.load_avg_5m ? `5m: ${m.load_avg_5m?.toFixed(2)} · 15m: ${m.load_avg_15m?.toFixed(2)}` : undefined}
        color="bg-violet-500/15 text-violet-400"
      />
      <MetricCard
        icon={Wifi}
        label="RX"
        value={m?.network_rx_mbps ?? null}
        unit="Mbps"
        color="bg-cyan-500/15 text-cyan-400"
      />
      <div className="glass-card p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-500/15 text-slate-400 flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
          <span className="text-xs text-muted-foreground font-medium">Uptime</span>
        </div>
        <div className="text-sm font-semibold">
          {m?.uptime_seconds
            ? formatDistanceToNow(new Date(Date.now() - m.uptime_seconds * 1000))
            : "—"}
        </div>
        <div className={`text-xs status-badge status-${vm.status} self-start`}>
          {vm.status}
        </div>
      </div>
    </div>
  );
}
