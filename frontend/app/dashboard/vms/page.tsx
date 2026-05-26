"use client";

import { useQueries } from "@tanstack/react-query";
import {
  useVMs,
  usePrometheusSources,
  useSyncVMs,
  queryKeys,
} from "@/hooks/useQueries";
import {
  VMTable,
  type SortState,
  type SortField,
} from "@/components/vm/VMTable";
import { Pagination } from "@/components/ui/Pagination";
import {
  SearchableSelect,
  type SelectOption,
} from "@/components/ui/SearchableSelect";
import {
  Server,
  RefreshCw,
  Search,
  Eye,
  EyeOff,
  X,
  Download,
} from "lucide-react";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ReportBuilder } from "@/components/reports/ReportBuilder";
import { toast } from "sonner";
import { prometheusService, vmService } from "@/services";
import { useRealtimeStore } from "@/stores";
import type { VM, VMMetrics, VMStatus } from "@/types";

const DEFAULT_PAGE_SIZE = 20;

const STATUS_PRIORITY: Record<VMStatus, number> = {
  critical: 0,
  warning: 1,
  healthy: 2,
  unknown: 3,
  down: 4,
};

function getVmStatus(
  vm: VM,
  realtime: Record<string, { status?: VMStatus }>,
): VMStatus {
  return realtime[vm.id]?.status ?? vm.status;
}

export default function VMsPage() {
  const [isReportOpen, setIsReportOpen] = useState(false);
  const { data: vmsData, isLoading } = useVMs();
  const { data: sources } = usePrometheusSources();
  const syncMutation = useSyncVMs();
  const realtimeMetrics = useRealtimeStore((s) => s.metrics);

  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const [jobs, setJobs] = useState<string[]>([]);
  const [selectedJob, setSelectedJob] = useState<string>("all");
  const [origins, setOrigins] = useState<string[]>([]);
  const [selectedOrigin, setSelectedOrigin] = useState<string>("all");

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const searchQuery = searchParams.get("q") ?? "";
  const statusFilter = searchParams.get("status") ?? "all";
  const showDown = searchParams.get("showDown") === "true";
  const page = Number(searchParams.get("page")) || 1;
  const pageSize = Number(searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE;
  const sortField = (searchParams.get("sortField") as SortField) || "hostname";
  const sortDir = (searchParams.get("sortDir") as "asc" | "desc") || "asc";
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

  const searchInputRef = useRef<HTMLInputElement>(null);

  const activeSources = sources?.filter((s) => s.is_active) ?? [];
  const allVms = vmsData?.vms ?? [];

  // ── Auto-select first source ──────────────────────────────────────────────
  useEffect(() => {
    if (!selectedSourceId && activeSources.length > 0) {
      setSelectedSourceId(activeSources[0].id);
    }
  }, [activeSources, selectedSourceId]);

  // ── Fetch jobs & origins per source ───────────────────────────────────────
  useEffect(() => {
    if (!selectedSourceId) {
      setJobs([]);
      setOrigins([]);
      return;
    }
    const fetchJobsAndOrigins = async () => {
      try {
        const [jobsList, originsList] = await Promise.all([
          prometheusService.listJobs(selectedSourceId),
          prometheusService.listOrigins(selectedSourceId),
        ]);
        setJobs(jobsList);
        setOrigins(originsList);
        setSelectedJob("all");
        setSelectedOrigin("all");
      } catch (err) {
        console.error("Failed to fetch metadata:", err);
      }
    };
    fetchJobsAndOrigins();
  }, [selectedSourceId]);

  // ── Down count ────────────────────────────────────────────────────────────
  const downCount = useMemo(
    () =>
      allVms.filter((vm) => getVmStatus(vm, realtimeMetrics) === "down").length,
    [allVms, realtimeMetrics],
  );

  // ── Filter ────────────────────────────────────────────────────────────────
  const filteredVms = useMemo(() => {
    return allVms.filter((vm) => {
      const status = getVmStatus(vm, realtimeMetrics);

      if (!showDown && statusFilter !== "down" && status === "down") {
        return false;
      }

      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        q === "" ||
        vm.hostname.toLowerCase().includes(q) ||
        vm.ip_address.toLowerCase().includes(q) ||
        (vm.cluster ?? "").toLowerCase().includes(q) ||
        (vm.tags ?? "").toLowerCase().includes(q);

      const matchesStatus = statusFilter === "all" || status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [allVms, searchQuery, statusFilter, showDown, realtimeMetrics]);

  // ── Sort ──────────────────────────────────────────────────────────────────
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

  // ── Pagination ────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(sortedVms.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const paginatedVms = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sortedVms.slice(start, start + pageSize);
  }, [sortedVms, safePage, pageSize]);

  // ── Fetch metrics for VMs on current page (fallback sebelum WebSocket tiba) ─
  const metricsQueries = useQueries({
    queries: paginatedVms.map((vm) => ({
      queryKey: queryKeys.vmMetrics(vm.id),
      queryFn: () => vmService.metrics(vm.id),
      staleTime: 15_000,
      refetchInterval: 30_000,
    })),
  });

  const apiMetricsMap = useMemo(() => {
    const map: Record<string, VMMetrics> = {};
    metricsQueries.forEach((result, idx) => {
      const vm = paginatedVms[idx];
      if (result.data && vm) {
        map[vm.id] = result.data;
      }
    });
    return map;
  }, [metricsQueries, paginatedVms]);

  useEffect(() => {
    if (page > totalPages && totalPages > 0) {
      updateParams({ page: String(totalPages) });
    }
  }, [page, totalPages, updateParams]);

  // ── Select options ────────────────────────────────────────────────────────
  const sourceOptions: SelectOption[] = activeSources.map((src) => ({
    value: src.id,
    label: src.name,
    sublabel: src.url,
  }));

  const originOptions: SelectOption[] = [
    { value: "all", label: "All Origins" },
    ...origins.map((o) => ({ value: o, label: o })),
  ];

  const jobOptions: SelectOption[] = [
    { value: "all", label: "All Jobs" },
    ...jobs.map((j) => ({ value: j, label: j })),
  ];

  // ── Sync handler ──────────────────────────────────────────────────────────
  const handleSync = async () => {
    if (!selectedSourceId) {
      toast.error(
        "Pilih Prometheus source terlebih dahulu di halaman Prometheus Sources",
      );
      return;
    }
    try {
      const data = await syncMutation.mutateAsync({
        job: selectedJob,
        origin_prometheus: selectedOrigin,
        source_id: selectedSourceId,
      });
      toast.success(`Synced ${data.created} VMs (${data.skipped} skipped)`);
    } catch {
      toast.error("Failed to sync VMs");
    }
  };

  const clearSearch = useCallback(() => {
    updateParams({ q: null, page: "1" });
    searchInputRef.current?.focus();
  }, [updateParams]);

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Server className="w-6 h-6 text-primary" />
            Virtual Machines
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage and monitor your infrastructure
            {vmsData?.total != null && (
              <span className="ml-1">· {vmsData.total} terdaftar</span>
            )}
          </p>
        </div>
        <button
          onClick={() => setIsReportOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-secondary hover:bg-secondary/80 border border-border transition-all"
        >
          <Download className="w-4 h-4" />
          Export Report
        </button>
      </div>

      {/* ── Filter Bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between bg-card border border-border/80 p-4 rounded-xl shadow-sm">
        {/* Left: search + status + show down */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 flex-1">
          {/* Search */}
          <div className="relative flex-1 max-w-md group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-foreground transition-colors" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Cari hostname, IP, cluster, tag..."
              value={searchQuery}
              onChange={(e) => updateParams({ q: e.target.value, page: "1" })}
              className="
                w-full bg-background border border-border rounded-lg
                pl-9 pr-9 py-2.5 text-sm
                focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-foreground/30
                placeholder:text-muted-foreground/60
                transition-all duration-200
              "
            />
            {searchQuery && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Status pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
            {[
              { label: "Semua", value: "all" },
              { label: "Healthy", value: "healthy" },
              { label: "Warning", value: "warning" },
              { label: "Critical", value: "critical" },
              { label: "Down", value: "down" },
              { label: "Unknown", value: "unknown" },
            ].map((btn) => (
              <button
                key={btn.value}
                onClick={() => updateParams({ status: btn.value, page: "1" })}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${
                  statusFilter === btn.value
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background text-muted-foreground border-border hover:bg-secondary hover:text-foreground"
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Show Down toggle */}
          <button
            type="button"
            onClick={() => updateParams({ showDown: showDown ? null : "true", page: "1" })}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap shrink-0 ${
              showDown
                ? "bg-secondary text-foreground border-border"
                : "bg-background text-muted-foreground border-border hover:bg-secondary hover:text-foreground"
            }`}
            title={showDown ? "Sembunyikan VM down" : "Tampilkan VM down"}
          >
            {showDown ? (
              <Eye className="w-3.5 h-3.5" />
            ) : (
              <EyeOff className="w-3.5 h-3.5" />
            )}
            {showDown ? "Hide Down" : "Show Down"}
            {!showDown && downCount > 0 && (
              <span className="bg-rose-500/15 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                {downCount}
              </span>
            )}
          </button>
        </div>

        {/* Right: Prometheus selects + sync */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 self-stretch lg:self-auto">
          {activeSources.length > 0 && (
            <div className="flex items-center gap-2 min-w-[180px]">
              <SearchableSelect
                options={sourceOptions}
                value={selectedSourceId}
                onChange={setSelectedSourceId}
                placeholder="Pilih source..."
                searchPlaceholder="Cari source..."
                label="Prometheus:"
                compact
                className="flex-1"
              />
            </div>
          )}

          {origins.length > 0 && (
            <div className="flex items-center gap-2 min-w-[160px]">
              <SearchableSelect
                options={originOptions}
                value={selectedOrigin}
                onChange={setSelectedOrigin}
                placeholder="Origin..."
                searchPlaceholder="Cari origin..."
                label="Origin:"
                compact
                className="flex-1"
              />
            </div>
          )}

          <div className="flex items-center gap-2 min-w-[140px]">
            <SearchableSelect
              options={jobOptions}
              value={selectedJob}
              onChange={setSelectedJob}
              placeholder="Job..."
              searchPlaceholder="Cari job..."
              label="Job:"
              compact
              className="flex-1"
            />
          </div>

          <button
            onClick={handleSync}
            disabled={syncMutation.isPending || !selectedSourceId}
            className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 active:scale-[0.98] transition-all font-medium text-sm disabled:opacity-50"
          >
            <RefreshCw
              className={`w-4 h-4 ${syncMutation.isPending ? "animate-spin" : ""}`}
            />
            {syncMutation.isPending ? "Syncing..." : "Sync from Prometheus"}
          </button>
        </div>
      </div>

      {/* ── Results info ────────────────────────────────────────────────────── */}
      {searchQuery && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {filteredVms.length} hasil untuk &quot;
            <span className="font-medium text-foreground">{searchQuery}</span>
            &quot;
          </span>
          <button
            type="button"
            onClick={clearSearch}
            className="text-primary hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="glass-card overflow-hidden flex flex-col">
        <VMTable
          vms={paginatedVms}
          isLoading={isLoading}
          sort={sort}
          onSortChange={(s) => updateParams({ sortField: s.field, sortDir: s.dir, page: "1" })}
          metricsMap={apiMetricsMap}
        />
        {!isLoading && sortedVms.length > 0 && (
          <Pagination
            page={safePage}
            pageSize={pageSize}
            total={sortedVms.length}
            onPageChange={(p) => updateParams({ page: String(p) })}
            onPageSizeChange={(size) => updateParams({ pageSize: String(size), page: "1" })}
          />
        )}
      </div>

      <ReportBuilder
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        defaultTitle="VM Monitoring Report"
      />
    </div>
  );
}
