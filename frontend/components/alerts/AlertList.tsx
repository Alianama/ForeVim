"use client";

import { formatDistanceToNow } from "date-fns";
import type { Alert } from "@/types";
import { useAcknowledgeAlert } from "@/hooks/useQueries";
import { AlertTriangle, CheckCircle, Info, XCircle } from "lucide-react";
import { toast } from "sonner";

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
    <div className="divide-y divide-border/50 overflow-y-auto" style={{ maxHeight: compact ? "380px" : undefined }}>
      {alerts.map((alert) => {
        const Icon = SEVERITY_ICON[alert.severity] ?? Info;
        const cls = SEVERITY_CLASSES[alert.severity] ?? "severity-info";

        return (
          <div key={alert.id} className="px-4 py-3 flex items-start gap-3 hover:bg-secondary/20 transition-colors">
            <span className={`status-badge ${cls} shrink-0 mt-0.5 p-1`}>
              <Icon className="w-3.5 h-3.5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground leading-snug">{alert.message}</p>
              <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                <span className="uppercase tracking-wide">{alert.metric}</span>
                <span>·</span>
                <span>
                  {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                </span>
                {alert.current_value !== null && (
                  <>
                    <span>·</span>
                    <span className="font-mono">{alert.current_value.toFixed(1)}%</span>
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
              <span className="shrink-0 text-[10px] text-muted-foreground">ACK'd</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
