"use client";

import { useVMRecommendation } from "@/hooks/useQueries";
import { type ForecastAlgorithm } from "@/types";
// Generic Tailwind components replacing shadcn
import { Loader2, ArrowUpCircle, ArrowDownCircle, CheckCircle2, Server, HardDrive, Cpu, AlertCircle } from "lucide-react";

interface VMRecommenderProps {
  vmId: string;
  algorithm: ForecastAlgorithm;
  periodDays: number;
}

export function VMRecommender({ vmId, algorithm, periodDays }: VMRecommenderProps) {
  const { data, isLoading, isError, error } = useVMRecommendation(
    vmId,
    algorithm,
    periodDays
  );

  if (isLoading) {
    return (
      <div className="border border-primary/20 bg-primary/5 rounded-xl shadow-sm">
        <div className="p-6 flex items-center justify-center space-x-4">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground animate-pulse">AI is analyzing VM sizing based on forecasting...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="border border-destructive/20 bg-destructive/5 rounded-xl shadow-sm">
        <div className="p-6 flex items-center space-x-4">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <p className="text-sm text-destructive font-medium">Failed to analyze VM: {(error as Error)?.message || "Unknown error"}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const renderRecommendation = (
    title: string,
    metric: "cpu" | "ram" | "disk",
    icon: React.ReactNode
  ) => {
    const rec = data[metric];
    if (!rec) return null;

    let badgeClasses = "px-3 py-1 font-semibold uppercase tracking-wider text-xs rounded-full border ";
    let actionIcon = <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
    
    if (rec.action === "INCREASE") {
      badgeClasses += "bg-destructive/10 text-destructive border-destructive/20";
      actionIcon = <ArrowUpCircle className="h-5 w-5 text-destructive" />;
    } else if (rec.action === "DECREASE") {
      badgeClasses += "bg-primary/10 text-primary border-primary/20"; // Primary color (blue/violet) for decrease (cost saving)
      actionIcon = <ArrowDownCircle className="h-5 w-5 text-primary" />;
    } else {
      badgeClasses += "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    }

    const unit = metric === "cpu" ? " Cores" : " GB";

    return (
      <div className="flex flex-col space-y-3 p-4 rounded-lg bg-background border shadow-sm transition-all hover:shadow-md">
        <div className="flex justify-between items-start">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-full bg-primary/10 text-primary">
              {icon}
            </div>
            <h4 className="font-semibold text-foreground tracking-tight">{title}</h4>
          </div>
          <span className={badgeClasses}>
            {rec.action}
          </span>
        </div>
        
        <div className="flex items-center space-x-4 pt-2">
          {actionIcon}
          <div className="flex flex-col">
            <span className="text-sm text-muted-foreground">Current</span>
            <span className="font-mono font-medium text-foreground">
              {rec.current_capacity ? `${rec.current_capacity}${unit}` : "N/A"}
            </span>
          </div>
          
          <div className="flex flex-col border-l pl-4">
            <span className="text-sm text-muted-foreground">Recommended</span>
            <span className="font-mono font-medium text-foreground">
               {rec.recommended_capacity ? `${rec.recommended_capacity}${unit}` : "N/A"}
            </span>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mt-2 border-t pt-3 leading-relaxed">
          {rec.reason}
        </p>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-primary/20 shadow-md bg-gradient-to-br from-background to-primary/5">
      <div className="pb-3 border-b border-border/50 bg-background/50 p-6 rounded-t-xl">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-xl font-semibold flex items-center gap-2">
              <span className="bg-gradient-to-r from-primary to-indigo-500 bg-clip-text text-transparent">
                ✨ AI Resource Analyzer
              </span>
            </h3>
            <p className="text-sm text-muted-foreground">
              Smart sizing recommendations based on {periodDays}-day forecasting model.
            </p>
          </div>
        </div>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {renderRecommendation("CPU Cores", "cpu", <Cpu className="h-5 w-5" />)}
          {renderRecommendation("Memory (RAM)", "ram", <Server className="h-5 w-5" />)}
          {renderRecommendation("Disk Storage", "disk", <HardDrive className="h-5 w-5" />)}
        </div>
      </div>
    </div>
  );
}
