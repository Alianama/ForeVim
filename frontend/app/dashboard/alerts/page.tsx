"use client";

import { useAlerts } from "@/hooks/useQueries";
import { AlertList } from "@/components/alerts/AlertList";
import { Bell } from "lucide-react";

export default function AlertsPage() {
  const { data: alerts, isLoading } = useAlerts(undefined, "active");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bell className="w-6 h-6 text-primary" />
            Active Alerts
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Real-time infrastructure alerts and notifications
          </p>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <AlertList alerts={alerts ?? []} isLoading={isLoading} />
      </div>
    </div>
  );
}
