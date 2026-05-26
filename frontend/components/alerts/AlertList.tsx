"use client";

import { formatDistanceToNow } from "date-fns";
import type { Alert } from "@/types";
import { useAcknowledgeAlert } from "@/hooks/useQueries";
import {
  AlertTriangle,
  CheckCircle,
  Info,
  XCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

interface Props {
  alerts: Alert[];
  isLoading: boolean;
  compact?: boolean;
}

const SEVERITY_ICON = {
  critical: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const SEVERITY_CLASSES = {
  critical: "severity-critical",
  warning: "severity-warning",
  info: "severity-info",
};

export function AlertList({ alerts, isLoading, compact }: Props) {
  const acknowledge = useAcknowledgeAlert();
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const totalPages = Math.ceil(alerts.length / itemsPerPage);
  const paginatedAlerts = alerts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  // Reset page when alerts change
  if (currentPage > totalPages && totalPages > 0) {
    setCurrentPage(1);
  }

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
        <p className="text-sm">No active alerts</p>
        <p className="text-xs">All systems healthy</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div
        className="divide-y divide-border/50 overflow-y-auto flex-1"
        style={{ maxHeight: compact ? "380px" : undefined }}
      >
        {paginatedAlerts.map((alert) => {
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
                <p className="text-xs font-medium text-foreground leading-snug">
                  {alert.message}
                </p>
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
              {alert.status === "active" && (
                <button
                  onClick={() => {
                    acknowledge.mutate(alert.id, {
                      onSuccess: () => toast.success("Alert acknowledged"),
                      onError: () => toast.error("Failed to acknowledge"),
                    });
                  }}
                  className="shrink-0 text-[10px] px-2 py-1 rounded bg-secondary hover:bg-muted transition-colors text-muted-foreground"
                >
                  ACK
                </button>
              )}
              {alert.status === "acknowledged" && (
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  ACK'd
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/50">
          <div className="text-xs text-muted-foreground">
            Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
            {Math.min(currentPage * itemsPerPage, alerts.length)} of{" "}
            {alerts.length} entries
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-1.5 rounded-md hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  currentPage === page
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-md hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
