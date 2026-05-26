"use client";

import {
  useDashboardSummary,
  useVMs,
  useAlerts,
  queryKeys,
} from "@/hooks/useQueries";
import { useQueryClient } from "@tanstack/react-query";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { TopMetricsPanel } from "@/components/dashboard/TopMetricsPanel";
import { VMTable, type SortState } from "@/components/vm/VMTable";
import { AlertList } from "@/components/alerts/AlertList";
import { useRealtimeStore } from "@/stores";
import {
  Activity,
  Bell,
  Server,
  Eye,
  EyeOff,
  RotateCw,
  Clock,
} from "lucide-react";
import { useState, useMemo, useEffect, useCallback } from "react";
import { toast } from "sonner";
import type { VM, VMStatus } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function getVmStatus(
  vm: VM,
  realtime: Record<string, { status?: VMStatus }>,
): VMStatus {
  return realtime[vm.id]?.status ?? vm.status;
}

function DashboardVMTable({
  vms,
  isLoading,
}: {
  vms: VM[];
  isLoading: boolean;
}) {
  const [sort, setSort] = useState<SortState>({
    field: "hostname",
    dir: "asc",
  });
  return (
    <VMTable
      vms={vms}
      isLoading={isLoading}
      sort={sort}
      onSortChange={setSort}
    />
  );
}

export default function DashboardPage() {
  const queryClient = useQueryClient();

  // Refresh interval state in ms (default to 10 seconds, stored in localStorage)
  const [refreshInterval, setRefreshInterval] = useState<number>(10000);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [manualSpinning, setManualSpinning] = useState(false);

  // Load saved refresh interval on mount
  useEffect(() => {
    const saved = localStorage.getItem("forevim-dashboard-refresh-interval");
    if (saved !== null) {
      setRefreshInterval(Number(saved));
    }

    // Always force an immediate reload of the data source when the application is opened (mounted)
    queryClient.invalidateQueries({ queryKey: queryKeys.summary });
    queryClient.invalidateQueries({ queryKey: queryKeys.vms });
    queryClient.invalidateQueries({
      queryKey: queryKeys.alerts(undefined, "active"),
    });

    setLastUpdated(new Date().toLocaleTimeString());
  }, [queryClient]);

  // Handle changing interval
  const handleIntervalChange = (val: number) => {
    setRefreshInterval(val);
    localStorage.setItem("forevim-dashboard-refresh-interval", String(val));
    toast.success(
      `Auto-refresh interval set to ${val === 0 ? "Manual / Off" : val >= 60000 ? `${val / 60000}m` : `${val / 1000}s`}`,
    );
  };

  // Queries with dynamic refetch interval
  const queryOptions = {
    refetchInterval: refreshInterval === 0 ? (false as const) : refreshInterval,
  };
  const {
    data: summary,
    isLoading: summaryLoading,
    isFetching: summaryFetching,
  } = useDashboardSummary(queryOptions);
  const {
    data: vmsData,
    isLoading: vmsLoading,
    isFetching: vmsFetching,
  } = useVMs(queryOptions);
  const {
    data: alerts,
    isLoading: alertsLoading,
    isFetching: alertsFetching,
  } = useAlerts(undefined, "active", queryOptions);

  const wsConnected = useRealtimeStore((s) => s.wsConnected);
  const realtimeMetrics = useRealtimeStore((s) => s.metrics);

  const [showDown, setShowDown] = useState(false);

  // Update last updated timestamp when query finishes fetching
  const isAnyFetching = summaryFetching || vmsFetching || alertsFetching;
  useEffect(() => {
    if (!isAnyFetching) {
      setLastUpdated(new Date().toLocaleTimeString());
    }
  }, [isAnyFetching]);

  // Manual refresh handler
  const handleManualRefresh = async () => {
    setManualSpinning(true);
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: queryKeys.summary }),
        queryClient.refetchQueries({ queryKey: queryKeys.vms }),
        queryClient.refetchQueries({
          queryKey: queryKeys.alerts(undefined, "active"),
        }),
      ]);
      setLastUpdated(new Date().toLocaleTimeString());
      toast.success("Datasource reloaded successfully");
    } catch {
      toast.error("Failed to reload datasource");
    } finally {
      setManualSpinning(false);
    }
  };

  const allVms = vmsData?.vms ?? [];

  const downCount = useMemo(
    () =>
      allVms.filter((vm) => getVmStatus(vm, realtimeMetrics) === "down").length,
    [allVms, realtimeMetrics],
  );

  const filteredVms = useMemo(() => {
    return allVms.filter((vm) => {
      const status = getVmStatus(vm, realtimeMetrics);

      if (!showDown && status === "down") {
        return false;
      }

      return true;
    });
  }, [allVms, showDown, realtimeMetrics]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Overview</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Infrastructure health at a glance
          </p>
        </div>

        {/* Dynamic Controls / Refresh Panel */}
        <div className="flex flex-wrap items-center gap-3 bg-secondary/20 border border-border/40 p-2 rounded-xl backdrop-blur-sm self-start sm:self-auto">
          {/* Realtime Status Indicator */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground border-r border-border/40 pr-3 shrink-0">
            <span
              className={`w-2 h-2 rounded-full ${
                wsConnected ? "bg-emerald-500" : "bg-red-500 animate-pulse"
              }`}
            />
            <span className="font-medium">
              {wsConnected ? "Realtime" : "Reconnecting..."}
            </span>
          </div>

          {/* Last Updated Timestamp */}
          {lastUpdated && (
            <div className="hidden md:flex items-center gap-1 text-[11px] text-muted-foreground pr-2 font-mono">
              <Clock className="w-3.5 h-3.5 opacity-60" />
              <span>Updated: {lastUpdated}</span>
            </div>
          )}

          {/* Auto Refresh Select Dropdown */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
              Refresh:
            </span>
            <Select
              value={String(refreshInterval)}
              onValueChange={(v) => handleIntervalChange(Number(v))}
            >
              <SelectTrigger size="sm" className="min-w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5000">5 Detik</SelectItem>
                <SelectItem value="10000">10 Detik</SelectItem>
                <SelectItem value="60000">1 Menit</SelectItem>
                <SelectItem value="1800000">30 Menit</SelectItem>
                <SelectItem value="0">Manual / Nonaktif</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Manual Refresh Button */}
          <button
            onClick={handleManualRefresh}
            disabled={isAnyFetching || manualSpinning}
            className="flex items-center justify-center p-2 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border/60 transition-all active:scale-95 disabled:opacity-50 shrink-0"
            title="Reload Datasource"
          >
            <RotateCw
              className={`w-3.5 h-3.5 ${
                isAnyFetching || manualSpinning
                  ? "animate-spin text-primary"
                  : ""
              }`}
            />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <SummaryCards data={summary} isLoading={summaryLoading} />

      {/* Top Resource Usage */}
      <TopMetricsPanel
        vms={allVms.map((v) => ({
          id: v.id,
          hostname: v.hostname,
          ip_address: v.ip_address,
        }))}
        metrics={realtimeMetrics}
      />

      {/* VM Table + Alerts Side by Side */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* VM Table */}
        <div className="xl:col-span-2 glass-card overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border/50">
            <Server className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              Virtual Machines
            </h2>

            {/* Show/Hide Down Toggle Button */}
            <button
              type="button"
              onClick={() => setShowDown((v) => !v)}
              className={`ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap shrink-0 ${
                showDown
                  ? "bg-secondary text-foreground border-border"
                  : "bg-background text-muted-foreground border-border hover:bg-secondary hover:text-foreground"
              }`}
              title={showDown ? "Hide down VMs" : "Show down VMs"}
            >
              {showDown ? (
                <Eye className="w-3.5 h-3.5" />
              ) : (
                <EyeOff className="w-3.5 h-3.5" />
              )}
              {showDown ? "Hide Down" : "Show Down"}
              {!showDown && downCount > 0 && (
                <span className="bg-rose-500/15 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 rounded-full text-[9px] font-bold">
                  {downCount}
                </span>
              )}
            </button>

            <span className="text-xs text-muted-foreground border-l border-border/50 pl-3">
              {filteredVms.length} of {allVms.length} shown
            </span>
          </div>
          <DashboardVMTable vms={filteredVms} isLoading={vmsLoading} />
        </div>

        {/* Active Alerts */}
        <div className="glass-card overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border/50">
            <Bell className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-foreground">
              Active Alerts
            </h2>
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
