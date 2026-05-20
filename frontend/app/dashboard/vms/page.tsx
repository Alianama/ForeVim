"use client";

import { useVMs } from "@/hooks/useQueries";
import { VMTable } from "@/components/vm/VMTable";
import { Server, RefreshCw, Search } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api-client";
import { useRealtimeStore } from "@/stores";

export default function VMsPage() {
  const { data: vmsData, isLoading } = useVMs();
  const realtimeMetrics = useRealtimeStore((s) => s.metrics);
  const qc = useQueryClient();

  const [syncing, setSyncing] = useState(false);
  const [jobs, setJobs] = useState<string[]>([]);
  const [selectedJob, setSelectedJob] = useState<string>("all");
  const [origins, setOrigins] = useState<string[]>([]);
  const [selectedOrigin, setSelectedOrigin] = useState<string>("all");
  
  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Fetch unique job and origin labels on mount
  useEffect(() => {
    const fetchJobsAndOrigins = async () => {
      try {
        const [jobsRes, originsRes] = await Promise.all([
          api.get<string[]>("/prometheus/jobs"),
          api.get<string[]>("/prometheus/origins")
        ]);
        setJobs(jobsRes.data);
        setOrigins(originsRes.data);
      } catch (err) {
        console.error("Failed to fetch metadata:", err);
      }
    };
    fetchJobsAndOrigins();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post<{ created: number; skipped: number }>("/prometheus/sync-vms", null, {
        params: { job: selectedJob, origin_prometheus: selectedOrigin }
      });
      toast.success(`Synced ${data.created} VMs (${data.skipped} skipped)`);
      qc.invalidateQueries({ queryKey: ["vms"] });
      qc.invalidateQueries({ queryKey: ["dashboard", "summary"] });
    } catch (err) {
      toast.error("Failed to sync VMs");
    } finally {
      setSyncing(false);
    }
  };

  // Perform client-side real-time filtering
  const filteredVms = (vmsData?.vms ?? []).filter((vm) => {
    // 1. Search hostname or IP Address
    const matchesSearch =
      searchQuery.trim() === "" ||
      vm.hostname.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vm.ip_address.toLowerCase().includes(searchQuery.toLowerCase());

    // 2. Filter status
    let matchesStatus = true;
    if (statusFilter !== "all") {
      const rt = realtimeMetrics[vm.id];
      const status = rt?.status ?? vm.status;
      matchesStatus = status === statusFilter;
    }

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Server className="w-6 h-6 text-primary" />
            Virtual Machines
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage and monitor your infrastructure
          </p>
        </div>
      </div>

      {/* Control Bar: Search, Status Filter, Job selector, Sync */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between bg-card border border-border/80 p-4 rounded-xl shadow-sm">
        {/* Left Control Group: Search & Status Filters */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 flex-1">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by hostname or IP..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-background border border-border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-all"
            />
          </div>

          {/* Status Filter Badges */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
            {[
              { label: "All Statuses", value: "all" },
              { label: "Healthy", value: "healthy" },
              { label: "Warning", value: "warning" },
              { label: "Critical", value: "critical" },
              { label: "Down", value: "down" },
              { label: "Unknown", value: "unknown" }
            ].map((btn) => (
              <button
                key={btn.value}
                onClick={() => setStatusFilter(btn.value)}
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
        </div>

        {/* Right Control Group: Job Selection & Sync Action */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 self-stretch lg:self-auto">
          {origins.length > 0 && (
            <div className="flex items-center justify-between sm:justify-start gap-2 bg-background border border-border px-3 py-1.5 rounded-lg">
              <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">
                Prometheus Origin:
              </span>
              <select
                value={selectedOrigin}
                onChange={(e) => setSelectedOrigin(e.target.value)}
                className="bg-transparent text-xs font-semibold focus:outline-none cursor-pointer pr-1"
              >
                <option value="all">All Origins</option>
                {origins.map((origin) => (
                  <option key={origin} value={origin}>
                    {origin}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center justify-between sm:justify-start gap-2 bg-background border border-border px-3 py-1.5 rounded-lg">
            <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">
              Prometheus Job:
            </span>
            <select
              value={selectedJob}
              onChange={(e) => setSelectedJob(e.target.value)}
              className="bg-transparent text-xs font-semibold focus:outline-none cursor-pointer pr-1"
            >
              <option value="all">All Jobs</option>
              {jobs.map((job) => (
                <option key={job} value={job}>
                  {job}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 active:scale-[0.98] transition-all font-medium text-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync from Prometheus"}
          </button>
        </div>
      </div>

      {/* VM List Table */}
      <div className="glass-card overflow-hidden">
        <VMTable vms={filteredVms} isLoading={isLoading} />
      </div>
    </div>
  );
}
