"use client";

import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import type { VM, VMMetrics, VMStatus } from "@/types";
import { useRealtimeStore } from "@/stores";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SortField =
  | "hostname"
  | "ip_address"
  | "status"
  | "cpu"
  | "ram"
  | "disk"
  | "last_seen";
export type SortDir = "asc" | "desc";

export interface SortState {
  field: SortField;
  dir: SortDir;
}

interface Props {
  vms: VM[];
  isLoading: boolean;
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  /** Fallback metrics dari API (digunakan sebelum data realtime WebSocket tiba) */
  metricsMap?: Record<string, VMMetrics>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ProgressMini({ value }: { value: number | null }) {
  if (value === null)
    return <span className="text-muted-foreground text-xs">—</span>;
  const level = value >= 85 ? "high" : value >= 70 ? "medium" : "low";
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="progress-bar flex-1 h-1">
        <div
          className={`progress-fill ${level} h-full`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span
        className={`text-xs tabular-nums w-10 text-right ${
          level === "high"
            ? "text-rose-600 dark:text-rose-400 font-medium"
            : level === "medium"
              ? "text-amber-600 dark:text-amber-400 font-medium"
              : "text-muted-foreground dark:text-zinc-400"
        }`}
      >
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

// ─── Sort Icon ────────────────────────────────────────────────────────────────

function SortIcon({ field, sort }: { field: SortField; sort: SortState }) {
  if (sort.field !== field) {
    return (
      <ArrowUpDown className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
    );
  }
  return sort.dir === "asc" ? (
    <ArrowUp className="w-3 h-3 text-foreground" />
  ) : (
    <ArrowDown className="w-3 h-3 text-foreground" />
  );
}

// ─── Sortable Header ──────────────────────────────────────────────────────────

interface SortableThProps {
  field: SortField;
  label: string;
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  className?: string;
}

function SortableTh({
  field,
  label,
  sort,
  onSortChange,
  className = "",
}: SortableThProps) {
  const handleClick = () => {
    if (sort.field === field) {
      onSortChange({ field, dir: sort.dir === "asc" ? "desc" : "asc" });
    } else {
      onSortChange({ field, dir: "asc" });
    }
  };

  return (
    <th
      onClick={handleClick}
      className={`cursor-pointer select-none group ${className}`}
    >
      <div className="flex items-center gap-1.5">
        <span>{label}</span>
        <SortIcon field={field} sort={sort} />
      </div>
    </th>
  );
}

// ─── Main Table ───────────────────────────────────────────────────────────────

export function VMTable({
  vms,
  isLoading,
  sort,
  onSortChange,
  metricsMap,
}: Props) {
  const router = useRouter();
  const realtimeMetrics = useRealtimeStore((s) => s.metrics);

  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <SortableTh
              field="hostname"
              label="Hostname"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableTh
              field="ip_address"
              label="IP Address"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableTh
              field="status"
              label="Status"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableTh
              field="cpu"
              label="CPU"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableTh
              field="ram"
              label="RAM"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableTh
              field="disk"
              label="Disk"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableTh
              field="last_seen"
              label="Last Seen"
              sort={sort}
              onSortChange={onSortChange}
            />
          </tr>
        </thead>
        <tbody>
          {isLoading && [...Array(5)].map((_, i) => <SkeletonRow key={i} />)}

          {!isLoading && vms.length === 0 && (
            <tr>
              <td
                colSpan={7}
                className="text-center py-12 text-muted-foreground text-sm"
              >
                No VMs registered. Add your first VM to get started.
              </td>
            </tr>
          )}

          {!isLoading &&
            vms.map((vm) => {
              const rt = realtimeMetrics[vm.id];
              const api = metricsMap?.[vm.id];
              const cpu = rt?.cpu_usage ?? api?.cpu_usage ?? null;
              const ram = rt?.ram_usage ?? api?.ram_usage ?? null;
              const disk = rt?.disk_usage ?? api?.disk_usage ?? null;
              const status = rt?.status ?? api?.status ?? vm.status;

              return (
                <tr
                  key={vm.id}
                  onClick={() => router.push(`/dashboard/vms/${vm.id}`)}
                  className="cursor-pointer"
                >
                  <td>
                    <div className="font-medium text-foreground">
                      {vm.hostname}
                    </div>
                    {vm.cluster && (
                      <div className="text-[10px] text-muted-foreground">
                        {vm.cluster}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className="font-mono text-xs text-muted-foreground">
                      {vm.ip_address}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge status-${status}`}>
                      <span className={`w-1.5 h-1.5 rounded-full bg-current`} />
                      {status}
                    </span>
                  </td>
                  <td>
                    <ProgressMini value={cpu} />
                  </td>
                  <td>
                    <ProgressMini value={ram} />
                  </td>
                  <td>
                    <ProgressMini value={disk} />
                  </td>
                  <td>
                    <span className="text-xs text-muted-foreground">
                      {vm.last_seen
                        ? formatDistanceToNow(new Date(vm.last_seen), {
                            addSuffix: true,
                          })
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
