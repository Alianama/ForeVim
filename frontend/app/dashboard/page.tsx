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
import { VMTable, type SortState, type SortField, type SortDir } from "@/components/vm/VMTable";
import { Pagination } from "@/components/ui/Pagination";
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
  Search,
  X,
} from "lucide-react";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
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

const STATUS_PRIORITY: Record<VMStatus, number> = {
  critical: 0,
  warning: 1,
  healthy: 2,
  unknown: 3,
  down: 4,
};

const DEFAULT_PAGE_SIZE = 10;

export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  const searchQuery = searchParams.get("q") ?? "";
  const showDown = searchParams.get("showDown") === "true";
  const page = Number(searchParams.get("page")) || 1;
  const pageSize = Number(searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE;
  const sortField = (searchParams.get("sortField") as SortField) || "hostname";
  const sortDir = (searchParams.get("sortDir") as SortDir) || "asc";
  const sort: SortState = { field: sortField, dir: sortDir };

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, pathname, router]
  );

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
      
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        q === "" ||
        vm.hostname.toLowerCase().includes(q) ||
        vm.ip_address.toLowerCase().includes(q) ||
        (vm.cluster ?? "").toLowerCase().includes(q) ||
        (vm.tags ?? "").toLowerCase().includes(q);

      return matchesSearch;
    });
  }, [allVms, showDown, searchQuery, realtimeMetrics]);

  const sortedVms = useMemo(() => {
    const arr = [...filteredVms];
    const dir = sort.dir === "asc" ? 1 : -1;

    arr.sort((a, b) => {
      const rtA = realtimeMetrics[a.id];
      const rtB = realtimeMetrics[b.id];

      switch (sort.field) {
        case "hostname":
          return dir * a.hostname.localeCompare(b.hostname);
        case "ip_address":
          return dir * a.ip_address.localeCompare(b.ip_address);
        case "status": {
          const sA = STATUS_PRIORITY[getVmStatus(a, realtimeMetrics)] ?? 99;
          const sB = STATUS_PRIORITY[getVmStatus(b, realtimeMetrics)] ?? 99;
          return dir * (sA - sB);
        }
        case "cpu": {
          const cpuA = rtA?.cpu_usage ?? -1;
          const cpuB = rtB?.cpu_usage ?? -1;
          return dir * (cpuA - cpuB);
        }
        case "ram": {
          const ramA = rtA?.ram_usage ?? -1;
          const ramB = rtB?.ram_usage ?? -1;
          return dir * (ramA - ramB);
        }
        case "disk": {
          const diskA = rtA?.disk_usage ?? -1;
          const diskB = rtB?.disk_usage ?? -1;
          return dir * (diskA - diskB);
        }
        case "last_seen": {
          const lsA = a.last_seen ? new Date(a.last_seen).getTime() : 0;
          const lsB = b.last_seen ? new Date(b.last_seen).getTime() : 0;
          return dir * (lsA - lsB);
        }
        default:
          return 0;
      }
    });

    return arr;
  }, [filteredVms, sort, realtimeMetrics]);

  const totalPages = Math.max(1, Math.ceil(sortedVms.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const paginatedVms = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sortedVms.slice(start, start + pageSize);
  }, [sortedVms, safePage, pageSize]);
  
  useEffect(() => {
    if (page > totalPages && totalPages > 0) {
      updateParams({ page: String(totalPages) });
    }
  }, [page, totalPages, updateParams]);
  
  const clearSearch = useCallback(() => {
    updateParams({ q: null, page: "1" });
    searchInputRef.current?.focus();
  }, [updateParams]);

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
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 border-b border-border/50">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground whitespace-nowrap">
                Virtual Machines
              </h2>
            </div>
            
            <div className="flex-1 min-w-[150px] max-w-sm relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground group-focus-within:text-foreground transition-colors" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Cari VM..."
                value={searchQuery}
                onChange={(e) => updateParams({ q: e.target.value, page: "1" })}
                className="w-full bg-background border border-border rounded-lg pl-8 pr-8 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Show/Hide Down Toggle Button */}
            <button
              type="button"
              onClick={() => updateParams({ showDown: showDown ? null : "true", page: "1" })}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap shrink-0 sm:ml-auto ${
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
          </div>
          <VMTable
            vms={paginatedVms}
            isLoading={vmsLoading}
            sort={sort}
            onSortChange={(s) => updateParams({ sortField: s.field, sortDir: s.dir, page: "1" })}
          />
          {!vmsLoading && sortedVms.length > 0 && (
            <Pagination
              page={safePage}
              pageSize={pageSize}
              total={sortedVms.length}
              onPageChange={(p: number) => updateParams({ page: String(p) })}
              onPageSizeChange={(size: number) => updateParams({ pageSize: String(size), page: "1" })}
            />
          )}
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
