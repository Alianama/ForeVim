"use client";

import { useState } from "react";
import { useVMs, useVMForecast, usePrometheusRetention } from "@/hooks/useQueries";
import { ForecastChart } from "@/components/charts/ForecastChart";
import { SearchableVMSelect } from "@/components/vm/SearchableVMSelect";
import { BarChart2 } from "lucide-react";
import type { ForecastMetric, ForecastAlgorithm } from "@/types";

export default function ForecastingPage() {
  const { data: vmsData } = useVMs();
  const vms = vmsData?.vms ?? [];
  const [selectedVmId, setSelectedVmId] = useState<string>("");
  const [metric, setMetric] = useState<ForecastMetric>("cpu");
  const [algorithm, setAlgorithm] = useState<ForecastAlgorithm>("linear_regression");
  const [periodDays, setPeriodDays] = useState<number>(7);

  const { data: retentionDays = 90 } = usePrometheusRetention();

  // Fetch forecast for selected VM
  const vmIdToUse = selectedVmId || (vms.length > 0 ? vms[0].id : "");
  
  const { data: forecast, isLoading } = useVMForecast(
    vmIdToUse,
    metric,
    algorithm,
    periodDays
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-primary" />
            AI Forecasting
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Predict resource usage based on historical trends
          </p>
        </div>
      </div>

      <div className="glass-card p-4 flex flex-wrap gap-4 items-center">
        <SearchableVMSelect
          vms={vms}
          selectedValue={vmIdToUse}
          onChange={(val) => setSelectedVmId(val)}
        />
        
        <select 
          className="bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:ring-primary focus:border-primary"
          value={metric}
          onChange={(e) => setMetric(e.target.value as ForecastMetric)}
        >
          <option value="cpu">CPU Usage</option>
          <option value="ram">RAM Usage</option>
          <option value="disk">Disk Usage</option>
        </select>
        
        <select 
          className="bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:ring-primary focus:border-primary"
          value={algorithm}
          onChange={(e) => setAlgorithm(e.target.value as ForecastAlgorithm)}
        >
          <option value="linear_regression">Linear Regression</option>
          <option value="moving_average">Moving Average</option>
        </select>

        <select 
          className="bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:ring-primary focus:border-primary"
          value={periodDays}
          onChange={(e) => setPeriodDays(Number(e.target.value))}
        >
          <option value={7}>7 Days Forecast</option>
          <option value={30}>1 Month Forecast</option>
          <option value={retentionDays}>Max Prometheus Data ({retentionDays}d)</option>
        </select>
      </div>

      {vmIdToUse ? (
        <ForecastChart data={forecast} isLoading={isLoading} metric={metric} />
      ) : (
        <div className="glass-card p-12 text-center text-muted-foreground flex flex-col items-center gap-2">
          <BarChart2 className="w-8 h-8 opacity-50" />
          <p>Please register or sync a VM first to view forecast data.</p>
        </div>
      )}
    </div>
  );
}
