"use client";

import { Server, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { DashboardSummary } from "@/types";

interface Props {
  data?: DashboardSummary;
  isLoading: boolean;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  loading,
}: {
  icon: React.ComponentType<any>;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  loading: boolean;
}) {
  if (loading) {
    return <div className="metric-card skeleton h-28" />;
  }

  return (
    <div className="metric-card">
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
        {sub && (
          <span className="text-[10px] text-muted-foreground font-mono">{sub}</span>
        )}
      </div>
      <div className="mt-4">
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      </div>
    </div>
  );
}

export function SummaryCards({ data, isLoading }: Props) {
  const d = data ?? {
    total_vms: 0, healthy_vms: 0, high_vms: 0, warning_vms: 0, critical_vms: 0,
    unknown_vms: 0, down_vms: 0, avg_cpu: 0, avg_ram: 0, avg_disk: 0,
    active_alerts: 0, critical_alerts: 0,
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        icon={Server} label="Total VMs" value={d.total_vms}
        color="bg-blue-500/15 text-blue-400" loading={isLoading}
      />
      <StatCard
        icon={CheckCircle2} label="Healthy" value={d.healthy_vms}
        color="bg-emerald-500/15 text-emerald-400" loading={isLoading}
      />
      <StatCard
        icon={AlertTriangle} label="High" value={d.high_vms}
        color="bg-amber-500/15 text-amber-400" loading={isLoading}
      />
      <StatCard
        icon={XCircle} label="Critical" value={d.critical_vms}
        color="bg-red-500/15 text-red-400" loading={isLoading}
      />
    </div>
  );
}

