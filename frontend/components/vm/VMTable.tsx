"use client";

import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import type { VM } from "@/types";
import { useRealtimeStore } from "@/stores";

interface Props {
  vms: VM[];
  isLoading: boolean;
}

function ProgressMini({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground text-xs">—</span>;
  const level = value >= 85 ? "high" : value >= 70 ? "medium" : "low";
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="progress-bar flex-1 h-1">
        <div className={`progress-fill ${level} h-full`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-xs tabular-nums w-10 text-right ${
        level === "high" ? "text-rose-600 dark:text-rose-400 font-medium" :
        level === "medium" ? "text-amber-600 dark:text-amber-400 font-medium" :
        "text-muted-foreground dark:text-zinc-400"
      }`}>
        {value.toFixed(0)}%
      </span>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr>
      {[...Array(7)].map((_, i) => (
        <td key={i} className="px-4 py-3.5 border-t border-border/50">
          <div className="skeleton h-4 w-full rounded" />
        </td>
      ))}
    </tr>
  );
}

export function VMTable({ vms, isLoading }: Props) {
  const router = useRouter();
  const realtimeMetrics = useRealtimeStore((s) => s.metrics);

  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>Hostname</th>
            <th>IP Address</th>
            <th>Status</th>
            <th>CPU</th>
            <th>RAM</th>
            <th>Disk</th>
            <th>Last Seen</th>
          </tr>
        </thead>
        <tbody>
          {isLoading &&
            [...Array(5)].map((_, i) => <SkeletonRow key={i} />)}

          {!isLoading && vms.length === 0 && (
            <tr>
              <td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                No VMs registered. Add your first VM to get started.
              </td>
            </tr>
          )}

          {!isLoading &&
            vms.map((vm) => {
              const rt = realtimeMetrics[vm.id];
              const cpu = rt?.cpu_usage ?? null;
              const ram = rt?.ram_usage ?? null;
              const disk = rt?.disk_usage ?? null;
              const status = rt?.status ?? vm.status;

              return (
                <tr
                  key={vm.id}
                  onClick={() => router.push(`/dashboard/vms/${vm.id}`)}
                  className="cursor-pointer"
                >
                  <td>
                    <div className="font-medium text-foreground">{vm.hostname}</div>
                    {vm.cluster && (
                      <div className="text-[10px] text-muted-foreground">{vm.cluster}</div>
                    )}
                  </td>
                  <td>
                    <span className="font-mono text-xs text-muted-foreground">{vm.ip_address}</span>
                  </td>
                  <td>
                    <span className={`status-badge status-${status}`}>
                      <span className={`w-1.5 h-1.5 rounded-full bg-current`} />
                      {status}
                    </span>
                  </td>
                  <td><ProgressMini value={cpu} /></td>
                  <td><ProgressMini value={ram} /></td>
                  <td><ProgressMini value={disk} /></td>
                  <td>
                    <span className="text-xs text-muted-foreground">
                      {vm.last_seen
                        ? formatDistanceToNow(new Date(vm.last_seen), { addSuffix: true })
                        : "Never"}
                    </span>
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
