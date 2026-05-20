"use client";

import { useDashboardSummary, useVMs, useAlerts } from "@/hooks/useQueries";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { VMTable } from "@/components/vm/VMTable";
import { AlertList } from "@/components/alerts/AlertList";
import { useRealtimeStore } from "@/stores";
import { Activity, Bell, Server } from "lucide-react";

export default function DashboardPage() {
  const { data: summary, isLoading: summaryLoading } = useDashboardSummary();
  const { data: vmsData, isLoading: vmsLoading } = useVMs();
  const { data: alerts, isLoading: alertsLoading } = useAlerts(undefined, "active");
  const wsConnected = useRealtimeStore((s) => s.wsConnected);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Overview</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Infrastructure health at a glance
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={`w-2 h-2 rounded-full ${
              wsConnected ? "bg-emerald-500" : "bg-red-500"
            }`}
          />
          <span>{wsConnected ? "Realtime" : "Reconnecting..."}</span>
        </div>
      </div>

      {/* Summary Cards */}
      <SummaryCards data={summary} isLoading={summaryLoading} />

      {/* VM Table + Alerts Side by Side */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* VM Table */}
        <div className="xl:col-span-2 glass-card overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border/50">
            <Server className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Virtual Machines</h2>
            <span className="ml-auto text-xs text-muted-foreground">
              {vmsData?.total ?? 0} registered
            </span>
          </div>
          <VMTable vms={vmsData?.vms ?? []} isLoading={vmsLoading} />
        </div>

        {/* Active Alerts */}
        <div className="glass-card overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border/50">
            <Bell className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-foreground">Active Alerts</h2>
            {(alerts?.length ?? 0) > 0 && (
              <span className="ml-auto bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full font-medium">
                {alerts?.length}
              </span>
            )}
          </div>
          <AlertList alerts={alerts ?? []} isLoading={alertsLoading} compact />
        </div>
      </div>
    </div>
  );
}
