"use client";

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import type { Alert } from "@/types";
import { useAcknowledgeAlert, useResolveAlert } from "@/hooks/useQueries";
import {
  AlertTriangle,
  CheckCircle,
  Info,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  alerts: Alert[];
  isLoading: boolean;
  compact?: boolean;
}

const SEVERITY_ICON = {
  critical: XCircle,
  high: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
};

const SEVERITY_CLASSES = {
  critical: "severity-critical",
  high: "severity-high",
  warning: "severity-warning",
  info: "severity-info",
};

function buildPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 5) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | "...")[] = [1];
  if (current > 3) pages.push("...");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    pages.push(p);
  }
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}

export function AlertList({ alerts, isLoading, compact }: Props) {
  const acknowledge = useAcknowledgeAlert();
  const resolve = useResolveAlert();
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(compact ? 5 : 10);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMetric, setSelectedMetric] = useState("all");
  const [selectedSeverity, setSelectedSeverity] = useState("all");

  // Client-side filtering
  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        q === "" ||
        alert.message.toLowerCase().includes(q) ||
        alert.metric.toLowerCase().includes(q);

      const matchesMetric =
        selectedMetric === "all" ||
        alert.metric.toLowerCase() === selectedMetric.toLowerCase() ||
        (selectedMetric === "cpu" && alert.metric.toLowerCase().startsWith("cpu")) ||
        (selectedMetric === "ram" && alert.metric.toLowerCase().startsWith("ram")) ||
        (selectedMetric === "disk" && alert.metric.toLowerCase().startsWith("disk"));

      const matchesSeverity =
        selectedSeverity === "all" ||
        alert.severity.toLowerCase() === selectedSeverity.toLowerCase() ||
        (selectedSeverity === "high" && alert.severity.toLowerCase() === "warning") ||
        (selectedSeverity === "warning" && alert.severity.toLowerCase() === "high");

      return matchesSearch && matchesMetric && matchesSeverity;
    });
  }, [alerts, searchQuery, selectedMetric, selectedSeverity]);

  const totalPages = Math.max(1, Math.ceil(filteredAlerts.length / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedAlerts = useMemo(() => {
    return filteredAlerts.slice(
      (safePage - 1) * itemsPerPage,
      safePage * itemsPerPage,
    );
  }, [filteredAlerts, safePage, itemsPerPage]);

  const startEntry = filteredAlerts.length === 0 ? 0 : (safePage - 1) * itemsPerPage + 1;
  const endEntry = Math.min(safePage * itemsPerPage, filteredAlerts.length);

  const handleClearAll = async () => {
    const toResolve = filteredAlerts.filter(
      (a) => a.status === "active" || a.status === "acknowledged"
    );
    if (toResolve.length === 0) return;

    const toastId = toast.loading("Clearing all alerts...");
    try {
      await Promise.all(
        toResolve.map((alert) => resolve.mutateAsync(alert.id))
      );
      toast.success("All alerts cleared successfully", { id: toastId });
    } catch {
      toast.error("Failed to clear some alerts", { id: toastId });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
        <CheckCircle className="w-8 h-8 text-emerald-500/50" />
        <p className="text-sm font-medium">No active alerts</p>
        <p className="text-xs">All systems are operating normally</p>
      </div>
    );
  }

  const pages = buildPageNumbers(safePage, totalPages);

  return (
    <div className="flex flex-col w-full">
      {/* Filters Toolbar */}
      {compact ? (
        /* Compact Mode Filter */
        <div className="p-3 border-b border-border/50 bg-secondary/10 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search hostname / alert type..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full bg-background border border-border/60 rounded-lg pl-8 pr-7 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setCurrentPage(1);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {filteredAlerts.some((a) => a.status === "active" || a.status === "acknowledged") && (
              <button
                onClick={handleClearAll}
                className="text-[10px] font-semibold px-2 py-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 transition-all shrink-0 active:scale-95"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Full Mode Filter Bar */
        <div className="p-4 border-b border-border/50 bg-secondary/15 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by hostname or type..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full bg-background border border-border rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setCurrentPage(1);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Metric Filter */}
            <div className="w-full sm:w-[150px]">
              <Select
                value={selectedMetric}
                onValueChange={(val) => {
                  setSelectedMetric(val);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger size="md" className="w-full bg-background">
                  <SelectValue placeholder="Alert Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="cpu">CPU Usage</SelectItem>
                  <SelectItem value="ram">RAM Usage</SelectItem>
                  <SelectItem value="disk">Disk Usage</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Severity Filter */}
            <div className="w-full sm:w-[165px]">
              <Select
                value={selectedSeverity}
                onValueChange={(val) => {
                  setSelectedSeverity(val);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger size="md" className="w-full bg-background">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Items Per Page Selector & Clear All */}
          <div className="flex items-center gap-3 self-end lg:self-auto shrink-0">
            {filteredAlerts.some((a) => a.status === "active" || a.status === "acknowledged") && (
              <button
                onClick={handleClearAll}
                className="text-xs font-semibold px-3 py-2 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 transition-all active:scale-[0.98]"
              >
                Clear All
              </button>
            )}
            
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Items per page:
              </span>
              <Select
                value={String(itemsPerPage)}
                onValueChange={(val) => {
                  setItemsPerPage(Number(val));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger size="sm" className="w-[75px] bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[5, 10, 25, 50].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* Alert List Items */}
      <div
        className="divide-y divide-border/50 overflow-y-auto flex-1"
        style={{ maxHeight: compact ? "380px" : undefined }}
      >
        {filteredAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
            <CheckCircle className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-sm font-medium">No matching alerts found</p>
            <p className="text-xs">Try adjusting your search or filters</p>
          </div>
        ) : (
          paginatedAlerts.map((alert) => {
            const Icon = SEVERITY_ICON[alert.severity] ?? Info;
            const cls = SEVERITY_CLASSES[alert.severity] ?? "severity-info";

            return (
              <div
                key={alert.id}
                className="px-4 py-3 flex items-start gap-3 hover:bg-secondary/20 transition-colors"
              >
                <span className={`status-badge ${cls} shrink-0 mt-0.5 p-1`}>
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/dashboard/vms/${alert.vm_id}`}
                    className="text-xs font-semibold text-foreground leading-snug hover:text-primary hover:underline transition-all block cursor-pointer"
                  >
                    {alert.message}
                  </Link>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                    <span className="uppercase tracking-wide">
                      {alert.metric}
                    </span>
                    <span>·</span>
                    <span>
                      {formatDistanceToNow(new Date(alert.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                    {alert.current_value !== null && (
                      <>
                        <span>·</span>
                        <span className="font-mono">
                          {alert.current_value.toFixed(1)}%
                        </span>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-1.5 shrink-0">
                  {alert.status === "active" && (
                    <button
                      onClick={() => {
                        acknowledge.mutate(alert.id, {
                          onSuccess: () => toast.success("Alert acknowledged"),
                          onError: () => toast.error("Failed to acknowledge"),
                        });
                      }}
                      className="text-[10px] px-2 py-1 rounded bg-secondary hover:bg-muted transition-colors text-muted-foreground border border-border/40"
                    >
                      ACK
                    </button>
                  )}
                  {(alert.status === "active" || alert.status === "acknowledged") && (
                    <button
                      onClick={() => {
                        resolve.mutate(alert.id, {
                          onSuccess: () => toast.success("Alert cleared successfully"),
                          onError: () => toast.error("Failed to clear alert"),
                        });
                      }}
                      className="text-[10px] px-2 py-1 rounded bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 transition-colors font-medium"
                      title="Clear Alert"
                    >
                      Clear
                    </button>
                  )}
                  {alert.status === "resolved" && (
                    <span className="text-[10px] text-muted-foreground font-medium bg-secondary/50 px-2 py-1 rounded border border-border/20">
                      Cleared
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Footer */}
      {filteredAlerts.length > 0 && (
        compact ? (
          /* Compact pagination (only when totalPages > 1 to save space) */
          totalPages > 1 && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-border/50 bg-secondary/5">
              <span className="text-[10px] text-muted-foreground">
                {startEntry}–{endEntry} of {filteredAlerts.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="p-1 rounded bg-background hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-border/40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-semibold text-foreground px-1.5 py-0.5 bg-secondary/60 rounded border border-border/40 min-w-[32px] text-center">
                  {safePage}/{totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="p-1 rounded bg-background hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-border/40"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )
        ) : (
          /* Full Mode Pagination */
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border/50 bg-secondary/5">
            <div className="text-xs text-muted-foreground">
              Showing{" "}
              <span className="font-semibold text-foreground">
                {startEntry}–{endEntry}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-foreground">
                {filteredAlerts.length}
              </span>{" "}
              entries
            </div>
            
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(safePage - 1)}
                disabled={safePage === 1}
                className="p-1.5 rounded-lg border border-border bg-background hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                aria-label="Previous"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1">
                {pages.map((p, i) =>
                  p === "..." ? (
                    <span
                      key={`ellipsis-${i}`}
                      className="px-1.5 text-xs text-muted-foreground"
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p as number)}
                      className={`min-w-[2rem] h-8 px-2 rounded-lg text-xs font-semibold transition-all ${
                        p === safePage
                          ? "bg-primary text-primary-foreground shadow"
                          : "bg-background border border-border hover:bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              </div>

              <button
                onClick={() => setCurrentPage(safePage + 1)}
                disabled={safePage === totalPages}
                className="p-1.5 rounded-lg border border-border bg-background hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                aria-label="Next"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}

