"use client";

import { useState } from "react";
import {
  useVMs,
  useVMForecast,
  useGenerateForecast,
  useForecastHistory,
} from "@/hooks/useQueries";
import { ForecastChart } from "@/components/charts/ForecastChart";
import { SearchableVMSelect } from "@/components/vm/SearchableVMSelect";
import { Button } from "@/components/ui/button";
import { BarChart2, Play, RefreshCw, History } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import type { ForecastMetric, ForecastAlgorithm } from "@/types";
import { FORECAST_ALGORITHMS, formatAccuracy } from "@/lib/forecast-algorithms";

export default function ForecastingPage() {
  const { data: vmsData } = useVMs();
  const vms = vmsData?.vms ?? [];

  const [selectedVmId, setSelectedVmId] = useState<string>("");
  const [metric, setMetric] = useState<ForecastMetric>("cpu");
  const [algorithm, setAlgorithm] = useState<ForecastAlgorithm>("auto");
  const [periodDays, setPeriodDays] = useState<number>(7);

  const generateMutation = useGenerateForecast();

  const { data: forecast, isLoading, refetch, isFetching } = useVMForecast(
    selectedVmId,
    metric,
    algorithm,
    periodDays,
    { enabled: !!selectedVmId }
  );

  const { data: history } = useForecastHistory(selectedVmId, !!selectedVmId);

  const selectedAlgo = FORECAST_ALGORITHMS.find((a) => a.value === algorithm);
  const selectedVm = vms.find((v) => v.id === selectedVmId);

  const handleGenerate = async () => {
    if (!selectedVmId) {
      toast.error("Pilih VM terlebih dahulu");
      return;
    }
    try {
      await generateMutation.mutateAsync({
        id: selectedVmId,
        metric,
        algorithm,
        periodDays,
      });
      toast.success("Forecast berhasil dihitung dan disimpan");
      refetch();
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Gagal menghitung forecast";
      toast.error(typeof detail === "string" ? detail : "Gagal menghitung forecast");
    }
  };

  const isRunning = generateMutation.isPending || isFetching;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-primary" />
            Resource Forecasting
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Forecast per VM — data disimpan di database setelah dijalankan
          </p>
        </div>
      </div>

      <div className="glass-card p-4 flex flex-col gap-4">
        <div className="flex flex-wrap gap-4 items-center">
          <SearchableVMSelect
            vms={vms}
            selectedValue={selectedVmId}
            onChange={setSelectedVmId}
          />

          <select
            className="bg-background border border-border rounded-md px-3 py-2 text-sm"
            value={metric}
            onChange={(e) => setMetric(e.target.value as ForecastMetric)}
            aria-label="Metrik"
            disabled={!selectedVmId}
          >
            <option value="cpu">CPU</option>
            <option value="ram">RAM</option>
            <option value="disk">Disk</option>
          </select>

          <select
            className="bg-background border border-border rounded-md px-3 py-2 text-sm min-w-[180px]"
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value as ForecastAlgorithm)}
            aria-label="Algoritma"
            disabled={!selectedVmId}
          >
            {FORECAST_ALGORITHMS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>

          <select
            className="bg-background border border-border rounded-md px-3 py-2 text-sm"
            value={periodDays}
            onChange={(e) => setPeriodDays(Number(e.target.value))}
            aria-label="Horizon"
            disabled={!selectedVmId}
          >
            <option value={1}>1 Hari</option>
            <option value={7}>7 Hari</option>
            <option value={14}>14 Hari</option>
            <option value={30}>30 Hari</option>
          </select>

          <Button
            onClick={handleGenerate}
            disabled={!selectedVmId || isRunning}
            className="gap-2"
          >
            {isRunning ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {isRunning ? "Menghitung..." : "Jalankan Forecast"}
          </Button>
        </div>

        {selectedVm && (
          <p className="text-xs text-muted-foreground border-t border-border/50 pt-3">
            <span className="font-semibold text-foreground">{selectedVm.hostname}</span> (
            {selectedVm.ip_address})
            {selectedVm.prometheus_source_id
              ? " · terhubung Prometheus"
              : " · belum punya Prometheus source — sync VM dulu"}
            {selectedAlgo && ` · ${selectedAlgo.description}`}
          </p>
        )}
      </div>

      {selectedVmId ? (
        <>
          <ForecastChart
            data={forecast}
            isLoading={isLoading && !forecast}
            metric={metric}
          />

          <div className="glass-card overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-border/50">
              <History className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold">Riwayat Forecast</h2>
              <span className="ml-auto text-xs text-muted-foreground">
                {history?.length ?? 0} entri
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
                      <td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                        Belum ada riwayat. Klik &quot;Jalankan Forecast&quot; untuk menyimpan hasil pertama.
                      </td>
                    </tr>
                  )}
                  {history?.map((h) => (
                    <tr key={h.id}>
                      <td className="text-xs">
                        {format(new Date(h.generated_at), "dd MMM yyyy HH:mm")}
                      </td>
                      <td className="uppercase text-xs font-medium">{h.metric}</td>
                      <td className="text-xs capitalize">
                        {h.algorithm.replace(/_/g, " ")}
                      </td>
                      <td className="text-xs">{h.forecast_period_days} hari</td>
                      <td className="text-xs font-mono">
                        {formatAccuracy(h.accuracy_score, "mape") ?? "—"}
                      </td>
                      <td>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            h.has_forecast
                              ? "bg-emerald-500/15 text-emerald-600"
                              : "bg-amber-500/15 text-amber-600"
                          }`}
                        >
                          {h.has_forecast ? "OK" : "Historis saja"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="glass-card p-12 text-center text-muted-foreground flex flex-col items-center gap-2">
          <BarChart2 className="w-8 h-8 opacity-50" />
          <p>Pilih VM dari dropdown, lalu klik &quot;Jalankan Forecast&quot;.</p>
        </div>
      )}
    </div>
  );
}
