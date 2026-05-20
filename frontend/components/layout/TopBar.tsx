"use client";

import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { SunIcon, MoonIcon } from "@animateicons/react/lucide";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRealtimeStore, useAuthStore } from "@/stores";
import { format } from "date-fns";

export function TopBar() {
  const queryClient = useQueryClient();
  const wsConnected = useRealtimeStore((s) => s.wsConnected);
  const user = useAuthStore((s) => s.user);
  const [refreshing, setRefreshing] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries();
    setTimeout(() => setRefreshing(false), 800);
  };

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card/50 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="hidden sm:inline">
          {format(new Date(), "EEEE, MMM d yyyy")}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* WebSocket Status */}
        <div className={`flex items-center gap-1.5 text-xs ${wsConnected ? "text-foreground" : "text-destructive"}`}>
          {wsConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{wsConnected ? "Live" : "Offline"}</span>
        </div>

        {/* Theme Switcher */}
        {mounted ? (
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground flex items-center justify-center"
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? (
              <SunIcon size={16} className="text-foreground transition-transform duration-300 hover:rotate-45" />
            ) : (
              <MoonIcon size={16} className="text-foreground transition-transform duration-300 hover:-rotate-12" />
            )}
          </button>
        ) : (
          <div className="w-7 h-7" />
        )}

        {/* Refresh */}
        <button
          onClick={handleRefresh}
          className="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          title="Refresh all data"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>

        {/* User Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-xs border border-border/40">
          <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-[10px]">
            {(user?.username?.[0] ?? "U").toUpperCase()}
          </div>
          <span className="text-foreground hidden sm:inline">
            {user?.username ?? "User"}
          </span>
        </div>
      </div>
    </header>
  );
}
