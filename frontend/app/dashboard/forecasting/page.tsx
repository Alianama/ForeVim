"use client";

import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useForecastOverview,
  useVMs,
  useVMForecast,
  useGenerateForecast,
  useForecastHistory,
} from "@/hooks/useQueries";
import { useForecastScanStore, useRealtimeStore } from "@/stores";
import { forecastService } from "@/services";
import { ReportBuilder } from "@/components/reports/ReportBuilder";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";
import { ForecastChart } from "@/components/charts/ForecastChart";
import { VMRecommender } from "@/components/vm/VMRecommender";
import { SearchableVMSelect } from "@/components/vm/SearchableVMSelect";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  BarChart2,
  Play,
  RefreshCw,
  History,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Activity,
  Search,
  X,
  Download,
  Cpu,
  MemoryStick,
  HardDrive,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import type {
  ForecastMetric,
  ForecastAlgorithm,
  ForecastOverviewItem,
  ForecastStatusItem,
} from "@/types";
import { FORECAST_ALGORITHMS, formatAccuracy } from "@/lib/forecast-algorithms";

// ─── Types ─────────────────────────────────────────────────────────────────────

type PageTab = "overview" | "per-vm";
type StatusFilter = "all" | "complete" | "partial" | "stale" | "missing";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getVmCompleteness(vm: ForecastOverviewItem): StatusFilter {
  const vals = [vm.forecasts.cpu, vm.forecasts.ram, vm.forecasts.disk];
  const fresh = vals.filter((v) => v && !v.is_expired).length;
  const any = vals.filter((v) => v !== null).length;
  if (fresh === 3) return "complete";
  if (any === 0) return "missing";
  if (any > 0 && fresh === 0) return "stale";
  return "partial";
}

// ─── ForecastCell ───────────────────────────────────────────────────────────────

function ForecastCell({
  item,
  metric,
}: {
  item: ForecastStatusItem | null;
  metric: string;
}) {
  const metricColor =
    metric === "cpu"
      ? "text-blue-400"
      : metric === "ram"
        ? "text-emerald-400"
        : "text-amber-400";

  if (!item) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
        <span className="text-xs text-muted-foreground/50">None</span>
      </div>
    );
  }

  const algoLabel = item.algorithm.replace(/_/g, " ");
  const timeAgo = formatDistanceToNow(new Date(item.generated_at), {
    addSuffix: true,
  });

  if (item.is_expired) {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1 text-xs text-amber-500 font-medium">
          <Clock className="w-3 h-3 shrink-0" />
          <span className="capitalize truncate max-w-[100px]">{algoLabel}</span>
        </div>
        <div className="text-[10px] text-amber-500/60">expired · {timeAgo}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div
        className={`flex items-center gap-1 text-xs font-medium ${metricColor}`}
      >
        <CheckCircle2 className="w-3 h-3 shrink-0" />
        <span className="capitalize truncate max-w-[100px]">{algoLabel}</span>
      </div>
      <div className="text-[10px] text-muted-foreground">
        {timeAgo}
        {item.accuracy_score != null && (
          <span className="ml-1 opacity-60">
            · MAPE {item.accuracy_score.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Scan Progress Panel ───────────────────────────────────────────────────────

function ScanProgressPanel({ onClose }: { onClose: () => void }) {
  const scan = useForecastScanStore((s) => s.scan);
  const pct =
    scan.total > 0 ? Math.round((scan.completed / scan.total) * 100) : 0;

  const algoLabel =
    FORECAST_ALGORITHMS.find((a) => a.value === scan.algorithm)
      ?.label.replace(" (Recommended)", "")
      .replace(" (ETS)", "") ?? scan.algorithm;

  return (
    <div className="glass-card border border-primary/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border-b border-primary/10">
        <div
          className={`w-2 h-2 rounded-full shrink-0 ${
            scan.isRunning
              ? "bg-blue-400 animate-pulse"
              : scan.errors > 0
                ? "bg-amber-400"
                : "bg-emerald-400"
          }`}
        />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold">
            {scan.isRunning ? "Scan in progress…" : "Scan completed"}
          </span>
          <span className="ml-2 text-xs text-muted-foreground tabular-nums">
            {scan.completed}/{scan.total}
            {scan.errors > 0 && (
              <span className="ml-1 text-red-400">· {scan.errors} error</span>
            )}
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground shrink-0">
          {algoLabel} · {scan.periodDays}d
        </span>
        {!scan.isRunning && (
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors ml-1"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-secondary relative overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${
            !scan.isRunning && scan.errors > 0 ? "bg-amber-500" : "bg-primary"
          }`}
          style={{ width: `${pct}%` }}
        />
        {scan.isRunning && (
          <div
            className="absolute inset-y-0 w-1/4 bg-white/10 animate-[shimmer_1.5s_ease-in-out_infinite]"
            style={{ left: `${Math.max(0, pct - 25)}%` }}
          />
        )}
      </div>

      {/* Event log */}
      <div className="max-h-44 overflow-y-auto divide-y divide-border/30">
        {scan.events.length === 0 && scan.isRunning && (
          <div className="px-4 py-3 text-xs text-muted-foreground text-center">
            <RefreshCw className="w-3 h-3 animate-spin inline mr-1.5" />
            Starting scan…
          </div>
        )}
        {scan.events.length === 0 && !scan.isRunning && scan.total > 0 && (
          <div className="px-4 py-3 text-xs text-center">
            {scan.errors === 0 ? (
              <span className="text-emerald-400">
                ✓ {scan.completed} tasks completed successfully
              </span>
            ) : (
              <span className="text-amber-400">
                {scan.completed - scan.errors} success, {scan.errors} error
              </span>
            )}
          </div>
        )}
        {scan.events.map((e, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-4 py-2 text-xs hover:bg-secondary/30 transition-colors"
          >
            {e.status === "done" ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            )}
            <span className="font-medium text-foreground w-28 truncate shrink-0">
              {e.hostname}
            </span>
            <span
              className={`uppercase text-[10px] font-bold w-8 shrink-0 ${
                e.metric === "cpu"
                  ? "text-blue-400"
                  : e.metric === "ram"
                    ? "text-emerald-400"
                    : "text-amber-400"
              }`}
            >
              {e.metric}
            </span>
            <span className="text-muted-foreground capitalize flex-1 truncate">
              {e.algorithm.replace(/_/g, " ")}
            </span>
            {e.error && (
              <span
                className="text-red-400/70 text-[10px] truncate max-w-[140px]"
                title={e.error}
              >
                {e.error}
              </span>
            )}
            <span className="text-muted-foreground/50 text-[10px] shrink-0">
              {format(new Date(e.ts), "HH:mm:ss")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
  bg,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  value: number;
  color: string;
  bg: string;
  icon: React.ComponentType<any>;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`glass-card p-4 flex items-center justify-between rounded-xl transition-all hover:shadow-md text-left ${
        active ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-border"
      }`}
    >
      <div>
        <div className={`text-2xl font-bold tabular-nums ${color}`}>
          {value}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      </div>
      <div
        className={`w-10 h-10 rounded-lg ${bg} ${color} flex items-center justify-center`}
      >
        <Icon className="w-5 h-5" />
      </div>
    </button>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ForecastingPage() {
  const queryClient = useQueryClient();

  // ── Tab ─────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<PageTab>("overview");
  const [isReportOpen, setIsReportOpen] = useState(false);

  // ── Overview ─────────────────────────────────────────────────────────────────
  const { data: overview = [], isLoading, refetch } = useForecastOverview();
  const [searchQuery, setSearchQuery] = useState("");
  const [algoFilter, setAlgoFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [scanAlgo, setScanAlgo] = useState("holt_winters");
  const [scanPeriod, setScanPeriod] = useState(7);
  const [isScanStarting, setIsScanStarting] = useState(false);
  const [showScanPanel, setShowScanPanel] = useState(false);
  const [overviewPage, setOverviewPage] = useState(1);
  const overviewItemsPerPage = 10;

  const realtimeMetrics = useRealtimeStore((s) => s.metrics);
  const scan = useForecastScanStore((s) => s.scan);
  const resetScan = useForecastScanStore((s) => s.resetScan);
  const scanPanelVisible =
    showScanPanel ||
    scan.isRunning ||
    (!scan.isRunning && scan.total > 0 && showScanPanel);

  // ── Per VM ───────────────────────────────────────────────────────────────────
  const { data: vmsData } = useVMs();
  const vms = vmsData?.vms ?? [];
  const [selectedVmId, setSelectedVmId] = useState<string>("");
  const [metric, setMetric] = useState<ForecastMetric>("cpu");
  const [algorithm, setAlgorithm] = useState<ForecastAlgorithm>("arima");
  const [periodDays, setPeriodDays] = useState<number>(7);
  const [historyPage, setHistoryPage] = useState(1);
  const historyItemsPerPage = 5;

  const generateMutation = useGenerateForecast();
  const {
    data: forecast,
    isLoading: forecastLoading,
    refetch: refetchForecast,
    isFetching,
  } = useVMForecast(selectedVmId, metric, algorithm, periodDays, {
    enabled: !!selectedVmId && activeTab === "per-vm",
  });
  const { data: history } = useForecastHistory(
    selectedVmId,
    !!selectedVmId && activeTab === "per-vm",
  );

  const selectedVm = vms.find((v) => v.id === selectedVmId);

  // ── Paginated history ─────────────────────────────────────────────────────────
  const historyTotalPages = history
    ? Math.ceil(history.length / historyItemsPerPage)
    : 0;
  const paginatedHistory = history
    ? history.slice(
        (historyPage - 1) * historyItemsPerPage,
        historyPage * historyItemsPerPage,
      )
    : [];

  // Reset history page when VM changes
  useMemo(() => {
    setHistoryPage(1);
  }, [selectedVmId]);

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let complete = 0,
      partial = 0,
      stale = 0,
      missing = 0;
    for (const vm of overview) {
      const c = getVmCompleteness(vm);
      if (c === "complete") complete++;
      else if (c === "partial") partial++;
      else if (c === "stale") stale++;
      else missing++;
    }
    return { complete, partial, stale, missing };
  }, [overview]);

  // ── Filtered overview ──────────────────────────────────────────────────────────
  const filteredOverview = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return overview.filter((vm) => {
      if (
        q &&
        !vm.hostname.toLowerCase().includes(q) &&
        !vm.ip_address.includes(q) &&
        !(vm.cluster ?? "").toLowerCase().includes(q)
      )
        return false;

      if (algoFilter !== "all") {
        const has = (["cpu", "ram", "disk"] as const).some(
          (m) => vm.forecasts[m]?.algorithm === algoFilter,
        );
        if (!has) return false;
      }

      if (statusFilter !== "all" && getVmCompleteness(vm) !== statusFilter)
        return false;

      return true;
    });
  }, [overview, searchQuery, algoFilter, statusFilter]);

  // ── Paginated overview ─────────────────────────────────────────────────────────
  const overviewTotalPages = Math.ceil(
    filteredOverview.length / overviewItemsPerPage,
  );
  const paginatedOverview = filteredOverview.slice(
    (overviewPage - 1) * overviewItemsPerPage,
    overviewPage * overviewItemsPerPage,
  );

  // Reset page when filters change
  useMemo(() => {
    setOverviewPage(1);
  }, [searchQuery, algoFilter, statusFilter]);

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleScanAll = async () => {
    setIsScanStarting(true);
    try {
      resetScan();
      await forecastService.startScan({
        algorithm: scanAlgo,
        period_days: scanPeriod,
        vm_ids: [],
      });
      setShowScanPanel(true);
      toast.success("Scan started! Monitor progress below.");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to start scan");
    } finally {
      setIsScanStarting(false);
    }
  };

  const handleScanVM = async (vmId: string) => {
    if (scan.isRunning) return toast.error("Another scan is currently running");
    try {
      resetScan();
      await forecastService.startScan({
        algorithm: scanAlgo,
        period_days: scanPeriod,
        vm_ids: [vmId],
      });
      setShowScanPanel(true);
      toast.success("VM scan started");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to start scan");
    }
  };

  const handleGeneratePerVM = async () => {
    if (!selectedVmId) return toast.error("Please select a VM first");
    try {
      await generateMutation.mutateAsync({
        id: selectedVmId,
        metric,
        algorithm,
        periodDays,
      });
      toast.success("Forecast successfully calculated and saved");
      refetchForecast();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to calculate forecast");
    }
  };

  const closeScanPanel = () => {
    setShowScanPanel(false);
    if (!scan.isRunning) resetScan();
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-primary" />
            Resource Forecasting
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage and monitor forecast status of all VMs in a single view
          </p>
        </div>
        <button
          onClick={() => setIsReportOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-secondary hover:bg-secondary/80 border border-border transition-all shrink-0"
        >
          <Download className="w-4 h-4" />
          Export Report
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-1">
          {(
            [
              { id: "overview", label: "Overview" },
              { id: "per-vm", label: "Per VM" },
            ] as { id: PageTab; label: string }[]
          ).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
                activeTab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════ TAB: OVERVIEW ══════════════════════ */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="Complete"
              value={stats.complete}
              color="text-emerald-400"
              bg="bg-emerald-500/10"
              icon={CheckCircle2}
              active={statusFilter === "complete"}
              onClick={() =>
                setStatusFilter(
                  statusFilter === "complete" ? "all" : "complete",
                )
              }
            />
            <StatCard
              label="Partial"
              value={stats.partial}
              color="text-blue-400"
              bg="bg-blue-500/10"
              icon={Activity}
              active={statusFilter === "partial"}
              onClick={() =>
                setStatusFilter(statusFilter === "partial" ? "all" : "partial")
              }
            />
            <StatCard
              label="Stale / Expired"
              value={stats.stale}
              color="text-amber-400"
              bg="bg-amber-500/10"
              icon={Clock}
              active={statusFilter === "stale"}
              onClick={() =>
                setStatusFilter(statusFilter === "stale" ? "all" : "stale")
              }
            />
            <StatCard
              label="Missing"
              value={stats.missing}
              color="text-rose-400"
              bg="bg-rose-500/10"
              icon={AlertTriangle}
              active={statusFilter === "missing"}
              onClick={() =>
                setStatusFilter(statusFilter === "missing" ? "all" : "missing")
              }
            />
          </div>

          {/* Controls: scan config + filters */}
          <div className="glass-card p-4 space-y-3">
            {/* Scan config row */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-muted-foreground font-semibold shrink-0 w-20">
                Scan Config
              </span>
              <Select
                value={scanAlgo}
                onValueChange={setScanAlgo}
                disabled={scan.isRunning}
              >
                <SelectTrigger size="sm" className="min-w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORECAST_ALGORITHMS.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label
                        .replace(" (Recommended)", "")
                        .replace(" (ETS)", "")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(scanPeriod)}
                onValueChange={(v) => setScanPeriod(Number(v))}
                disabled={scan.isRunning}
              >
                <SelectTrigger size="sm" className="min-w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                </SelectContent>
              </Select>
              <button
                onClick={handleScanAll}
                disabled={isScanStarting || scan.isRunning}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all"
              >
                {scan.isRunning ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Activity className="w-3.5 h-3.5" />
                )}
                {scan.isRunning
                  ? `Scanning… ${scan.completed}/${scan.total}`
                  : "Scan All VMs"}
              </button>
              <button
                onClick={() => refetch()}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary border border-border transition-all"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
                />
                Refresh
              </button>
            </div>

            <div className="border-t border-border/50" />

            {/* Filter row */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-muted-foreground font-semibold shrink-0 w-20">
                Filter
              </span>

              {/* Search */}
              <div className="relative min-w-[180px] max-w-xs flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Hostname, IP, cluster…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-background border border-border rounded-md pl-8 pr-8 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring/50 placeholder:text-muted-foreground/50"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Algorithm filter */}
              <Select
                value={algoFilter}
                onValueChange={setAlgoFilter}
              >
                <SelectTrigger size="sm" className="min-w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Algorithms</SelectItem>
                  {FORECAST_ALGORITHMS.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label
                        .replace(" (Recommended)", "")
                        .replace(" (ETS)", "")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Status pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { v: "all" as StatusFilter, l: "All" },
                  { v: "complete" as StatusFilter, l: "Complete" },
                  { v: "partial" as StatusFilter, l: "Partial" },
                  { v: "stale" as StatusFilter, l: "Stale" },
                  { v: "missing" as StatusFilter, l: "Missing" },
                ].map(({ v, l }) => (
                  <button
                    key={v}
                    onClick={() => setStatusFilter(v)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                      statusFilter === v
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Scan Progress Panel */}
          {(scan.isRunning || showScanPanel) && (
            <ScanProgressPanel onClose={closeScanPanel} />
          )}

          {/* VM Forecast Table */}
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="min-w-[200px]">VM</th>
                    <th className="min-w-[150px]">
                      <span className="text-blue-400">CPU</span>
                    </th>
                    <th className="min-w-[150px]">
                      <span className="text-emerald-400">RAM</span>
                    </th>
                    <th className="min-w-[150px]">
                      <span className="text-amber-400">Disk</span>
                    </th>
                    <th className="w-28 text-right pr-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Loading skeletons */}
                  {isLoading &&
                    [...Array(6)].map((_, i) => (
                      <tr key={i}>
                        {[...Array(5)].map((_, j) => (
                          <td key={j} className="py-3">
                            <div className="skeleton h-8 w-full rounded" />
                          </td>
                        ))}
                      </tr>
                    ))}

                  {/* Empty states */}
                  {!isLoading && overview.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="text-center py-16 text-muted-foreground text-sm"
                      >
                        <BarChart2 className="w-8 h-8 opacity-30 mx-auto mb-2" />
                        No registered VMs yet.
                      </td>
                    </tr>
                  )}
                  {!isLoading &&
                    overview.length > 0 &&
                    filteredOverview.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="text-center py-12 text-muted-foreground text-sm"
                        >
                          No VMs match the filter.
                        </td>
                      </tr>
                    )}

                  {/* Data rows */}
                  {!isLoading &&
                    paginatedOverview.map((vm) => {
                      const completeness = getVmCompleteness(vm);
                      const completenessColors: Record<StatusFilter, string> = {
                        all: "",
                        complete: "border-l-2 border-l-emerald-500/40",
                        partial: "border-l-2 border-l-blue-500/40",
                        stale: "border-l-2 border-l-amber-500/40",
                        missing: "border-l-2 border-l-rose-500/20",
                      };

                      return (
                        <tr
                          key={vm.vm_id}
                          className={`${completenessColors[completeness]} cursor-pointer hover:bg-secondary/30 transition-colors`}
                          onClick={() => {
                            setSelectedVmId(vm.vm_id);
                            setActiveTab("per-vm");
                          }}
                        >
                          {/* VM info */}
                          <td>
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-sm text-foreground">
                                  {vm.hostname}
                                </span>
                                {!vm.has_prometheus && (
                                  <span className="text-[10px] bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded-full leading-none">
                                    no prom
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {vm.ip_address}
                              </span>
                              {(vm.location || vm.cluster) && (
                                <span className="text-[10px] text-muted-foreground">
                                  {[vm.location, vm.cluster]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* CPU / RAM / Disk cells */}
                          {(["cpu", "ram", "disk"] as const).map((m) => (
                            <td key={m}>
                              <ForecastCell item={vm.forecasts[m]} metric={m} />
                            </td>
                          ))}

                          {/* Action */}
                          <td className="text-right pr-4">
                            <button
                              onClick={() => handleScanVM(vm.vm_id)}
                              disabled={!vm.has_prometheus || scan.isRunning}
                              title={
                                !vm.has_prometheus
                                  ? "VM not connected to Prometheus"
                                  : "Run forecast for this VM"
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-secondary hover:bg-primary/20 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-all border border-border"
                            >
                              <Play className="w-3 h-3" />
                              Run
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Table footer */}
            {!isLoading && filteredOverview.length > 0 && (
              <>
                <div className="px-4 py-2.5 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {filteredOverview.length === overview.length
                      ? `${overview.length} VMs`
                      : `${filteredOverview.length} of ${overview.length} VMs`}
                  </span>
                  {(searchQuery ||
                    algoFilter !== "all" ||
                    statusFilter !== "all") && (
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setAlgoFilter("all");
                        setStatusFilter("all");
                      }}
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      <X className="w-3 h-3" />
                      Reset filters
                    </button>
                  )}
                </div>

                {/* Pagination */}
                {overviewTotalPages > 1 && (
                  <div className="px-4 py-2.5 border-t border-border/50 flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      Showing {(overviewPage - 1) * overviewItemsPerPage + 1} to{" "}
                      {Math.min(
                        overviewPage * overviewItemsPerPage,
                        filteredOverview.length,
                      )}{" "}
                      of {filteredOverview.length} entries
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setOverviewPage(overviewPage - 1)}
                        disabled={overviewPage === 1}
                        className="p-1.5 rounded-md hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      {Array.from(
                        { length: overviewTotalPages },
                        (_, i) => i + 1,
                      ).map((page) => (
                        <button
                          key={page}
                          onClick={() => setOverviewPage(page)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            overviewPage === page
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-secondary text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                      <button
                        onClick={() => setOverviewPage(overviewPage + 1)}
                        disabled={overviewPage === overviewTotalPages}
                        className="p-1.5 rounded-md hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════ TAB: PER VM ══════════════════════ */}
      <ReportBuilder
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        defaultTitle="Forecast & Infrastructure Report"
      />

      {activeTab === "per-vm" && (
        <div className="space-y-6">
          {/* Config card */}
          <div className="glass-card p-4 flex flex-col gap-4">
            <div className="flex flex-wrap gap-3 items-center">
              <SearchableVMSelect
                vms={vms}
                selectedValue={selectedVmId}
                onChange={setSelectedVmId}
              />
              <Select
                value={metric}
                onValueChange={(v) => setMetric(v as ForecastMetric)}
                disabled={!selectedVmId}
              >
                <SelectTrigger className="min-w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cpu">CPU</SelectItem>
                  <SelectItem value="ram">RAM</SelectItem>
                  <SelectItem value="disk">Disk</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={algorithm}
                onValueChange={(v) => setAlgorithm(v as ForecastAlgorithm)}
                disabled={!selectedVmId}
              >
                <SelectTrigger className="min-w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORECAST_ALGORITHMS.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(periodDays)}
                onValueChange={(v) => setPeriodDays(Number(v))}
                disabled={!selectedVmId}
              >
                <SelectTrigger className="min-w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Day</SelectItem>
                  <SelectItem value="7">7 Days</SelectItem>
                  <SelectItem value="14">14 Days</SelectItem>
                  <SelectItem value="30">30 Days</SelectItem>
                  <SelectItem value="60">60 Days</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={handleGeneratePerVM}
                disabled={
                  !selectedVmId || generateMutation.isPending || isFetching
                }
                className="gap-2"
              >
                {generateMutation.isPending || isFetching ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {generateMutation.isPending
                  ? "Calculating…"
                  : "Run Forecast"}
              </Button>
            </div>

            {selectedVm && (
              <p className="text-xs text-muted-foreground border-t border-border/50 pt-3">
                <span className="font-semibold text-foreground">
                  {selectedVm.hostname}
                </span>{" "}
                ({selectedVm.ip_address})
                {selectedVm.prometheus_source_id
                  ? " · connected to Prometheus"
                  : " · no Prometheus source — sync VM first"}
              </p>
            )}
          </div>

          {selectedVmId ? (
            <>
              <VMRecommender
                vmId={selectedVmId}
                algorithm={algorithm}
                periodDays={periodDays}
              />
              <ForecastChart
                data={forecast}
                isLoading={forecastLoading && !forecast}
                metric={metric}
              />

              {/* History table */}
              <div className="glass-card overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-border/50">
                  <History className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-semibold">Forecast History</h2>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {history?.length ?? 0} saved entries
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Waktu</th>
                        <th>Metrik</th>
                        <th>Model</th>
                        <th>Horizon</th>
                        <th>MAPE</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!history?.length && (
                        <tr>
                          <td
                            colSpan={6}
                            className="text-center py-8 text-muted-foreground text-sm"
                          >
                            No history yet. Click "Run Forecast" to save the first result.
                          </td>
                        </tr>
                      )}
                      {paginatedHistory.map((h) => (
                        <tr key={h.id}>
                          <td className="text-xs">
                            {format(
                              new Date(h.generated_at),
                              "dd MMM yyyy HH:mm",
                            )}
                          </td>
                          <td className="uppercase text-xs font-medium">
                            {h.metric}
                          </td>
                          <td className="text-xs capitalize">
                            {h.algorithm.replace(/_/g, " ")}
                          </td>
                          <td className="text-xs">
                            {h.forecast_period_days} days
                          </td>
                          <td className="text-xs font-mono">
                            {formatAccuracy(h.accuracy_score, "mape") ?? "—"}
                          </td>
                          <td>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                h.has_forecast
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                              }`}
                            >
                              {h.has_forecast ? "OK" : "Historical only"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination for history table */}
                {historyTotalPages > 1 && (
                  <div className="px-4 py-2.5 border-t border-border/50 flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      Showing {(historyPage - 1) * historyItemsPerPage + 1} to{" "}
                      {Math.min(
                        historyPage * historyItemsPerPage,
                        history?.length ?? 0,
                      )}{" "}
                      of {history?.length ?? 0} entries
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setHistoryPage(historyPage - 1)}
                        disabled={historyPage === 1}
                        className="p-1.5 rounded-md hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      {Array.from(
                        { length: historyTotalPages },
                        (_, i) => i + 1,
                      ).map((page) => (
                        <button
                          key={page}
                          onClick={() => setHistoryPage(page)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            historyPage === page
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-secondary text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                      <button
                        onClick={() => setHistoryPage(historyPage + 1)}
                        disabled={historyPage === historyTotalPages}
                        className="p-1.5 rounded-md hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="glass-card p-16 text-center text-muted-foreground flex flex-col items-center gap-3">
              <BarChart2 className="w-10 h-10 opacity-30" />
              <p className="text-sm">
                Select a VM from the dropdown, then click "Run Forecast".
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
