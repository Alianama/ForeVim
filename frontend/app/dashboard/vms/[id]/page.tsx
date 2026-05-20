"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useVM, useVMHistory, useVMForecast, useVMMetrics, useAlerts, usePrometheusRetention } from "@/hooks/useQueries";
import { MetricsOverviewCards } from "@/components/vm/MetricsOverviewCards";
import { MetricLineChart } from "@/components/charts/MetricLineChart";
import { ForecastChart } from "@/components/charts/ForecastChart";
import { AlertList } from "@/components/alerts/AlertList";
import { ArrowLeft, Cpu, HardDrive, MemoryStick, Network, TrendingUp, Terminal } from "lucide-react";
import type { ForecastAlgorithm, ForecastMetric } from "@/types";

type Tab = "metrics" | "forecast" | "alerts";
const METRIC_TABS = ["cpu", "ram", "disk", "network_rx"] as const;

export default function VMDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>("metrics");
  const [historyHours, setHistoryHours] = useState(24);
  const [forecastMetric, setForecastMetric] = useState<ForecastMetric>("cpu");
  const [forecastPeriod, setForecastPeriod] = useState(7);
  const [forecastAlgo, setForecastAlgo] = useState<ForecastAlgorithm>("linear_regression");

  const { data: retentionDays = 90 } = usePrometheusRetention();

  const PERIOD_OPTIONS = [
    { label: "7 Days", days: 7 },
    { label: "1 Month", days: 30 },
    { label: `Max Prometheus Data (${retentionDays}d)`, days: retentionDays }
  ];

  const { data: vm, isLoading: vmLoading } = useVM(id);
  const { data: metrics } = useVMMetrics(id);
  const { data: cpuHistory } = useVMHistory(id, "cpu", historyHours, "5m");
  const { data: ramHistory } = useVMHistory(id, "ram", historyHours, "5m");
  const { data: diskHistory } = useVMHistory(id, "disk", historyHours, "5m");
  const { data: netHistory } = useVMHistory(id, "network_rx", historyHours, "5m");
  const { data: forecast, isLoading: forecastLoading } = useVMForecast(
    id, forecastMetric, forecastAlgo, forecastPeriod
  );
  const { data: alerts } = useAlerts(id);

  if (vmLoading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton h-32 w-full" />
        ))}
      </div>
    );
  }

  if (!vm) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">VM not found</p>
        <button onClick={() => router.push("/dashboard")} className="text-primary text-sm">
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => router.push("/dashboard")}
          className="mt-1 p-2 rounded-lg hover:bg-secondary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{vm.hostname}</h1>
            <span className={`status-badge status-${vm.status}`}>
              <span className={`w-1.5 h-1.5 rounded-full bg-current`} />
              {vm.status}
            </span>
            <button
              onClick={() => router.push(`/dashboard/vms/${vm.id}/ssh`)}
              className="ml-4 flex items-center gap-2 bg-secondary text-foreground hover:bg-primary/20 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-border"
            >
              <Terminal className="w-3.5 h-3.5" />
              Web SSH
            </button>
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
            <span>{vm.ip_address}</span>
            {vm.location && <span>· {vm.location}</span>}
            <span>· {vm.environment}</span>
            {vm.cluster && <span>· {vm.cluster}</span>}
          </div>
        </div>
      </div>

      {/* Metrics Overview */}
      <MetricsOverviewCards vm={vm} metrics={metrics} />

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-1">
          {(["metrics", "forecast", "alerts"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-all -mb-px ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
              {tab === "alerts" && (alerts?.length ?? 0) > 0 && (
                <span className="ml-2 text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">
                  {alerts?.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab: Metrics */}
      {activeTab === "metrics" && (
        <div className="space-y-6">
          {/* Time range selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Time Range:</span>
            {[6, 24, 48, 168].map((h) => (
              <button
                key={h}
                onClick={() => setHistoryHours(h)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  historyHours === h
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {h < 24 ? `${h}h` : `${h / 24}d`}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MetricLineChart
              title="CPU Usage"
              data={cpuHistory?.data ?? []}
              color="#3b82f6"
              unit="%"
              icon={<Cpu className="w-4 h-4" />}
              threshold={85}
            />
            <MetricLineChart
              title="RAM Usage"
              data={ramHistory?.data ?? []}
              color="#10b981"
              unit="%"
              icon={<MemoryStick className="w-4 h-4" />}
              threshold={90}
            />
            <MetricLineChart
              title="Disk Usage"
              data={diskHistory?.data ?? []}
              color="#f59e0b"
              unit="%"
              icon={<HardDrive className="w-4 h-4" />}
              threshold={85}
            />
            <MetricLineChart
              title="Network RX"
              data={netHistory?.data ?? []}
              color="#8b5cf6"
              unit=" Mbps"
              icon={<Network className="w-4 h-4" />}
            />
          </div>
        </div>
      )}

      {/* Tab: Forecast */}
      {activeTab === "forecast" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Metric selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Metric:</span>
              {(["cpu", "ram", "disk"] as ForecastMetric[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setForecastMetric(m)}
                  className={`px-3 py-1 rounded-md text-xs font-medium uppercase transition-all ${
                    forecastMetric === m
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Period selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Period:</span>
              {PERIOD_OPTIONS.map(({ label, days }) => (
                <button
                  key={days}
                  onClick={() => setForecastPeriod(days)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    forecastPeriod === days
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Algorithm selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Algorithm:</span>
              {(["linear_regression", "moving_average"] as ForecastAlgorithm[]).map((a) => (
                <button
                  key={a}
                  onClick={() => setForecastAlgo(a)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    forecastAlgo === a
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {a === "linear_regression" ? "Linear Reg." : "Moving Avg."}
                </button>
              ))}
            </div>
          </div>

          <ForecastChart
            data={forecast}
            isLoading={forecastLoading}
            metric={forecastMetric}
          />
        </div>
      )}

      {/* Tab: Alerts */}
      {activeTab === "alerts" && (
        <div className="glass-card overflow-hidden">
          <AlertList alerts={alerts ?? []} isLoading={false} />
        </div>
      )}
    </div>
  );
}
