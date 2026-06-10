"use client";

import { RefreshCw, Wifi, WifiOff, ChevronDown, User as UserIcon, LogOut } from "lucide-react";
import { SunIcon, MoonIcon } from "@animateicons/react/lucide";
import { useTheme } from "next-themes";
import { useEffect, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRealtimeStore, useAuthStore } from "@/stores";
import { format } from "date-fns";
import { useRouter } from "next/navigation";

export function TopBar() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const wsConnected = useRealtimeStore((s) => s.wsConnected);
  const { user, logout } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  const getAvatarUrl = () => {
    if (user?.profile_image) {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
      const origin = baseUrl.replace(/\/api\/v1\/?$/, "");
      return `${origin}${user.profile_image}`;
    }
    return null;
  };
  const avatarUrl = getAvatarUrl();

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

        {/* User Badge with Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-xs border border-border/40 transition-colors text-left"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                className="w-5 h-5 rounded-full object-cover border border-border/40"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-[10px]">
                {(user?.username?.[0] ?? "U").toUpperCase()}
              </div>
            )}
            <span className="text-foreground hidden sm:inline font-medium">
              {user?.full_name || user?.username || "User"}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
          </button>

          {isOpen && (
            <div className="absolute right-0 mt-1 w-56 bg-popover border border-border rounded-lg shadow-lg z-50 glass-card overflow-hidden py-1 animate-in fade-in-50 slide-in-from-top-1 duration-150">
              {/* User Info Header */}
              <div className="px-3 py-2 border-b border-border/50 bg-background/30">
                <p className="text-xs font-semibold text-foreground truncate">
                  {user?.full_name || user?.username || "User"}
                </p>
                <p className="text-[10px] text-muted-foreground truncate capitalize">
                  {user?.role} Account
                </p>
              </div>

              {/* Menu Links */}
              <button
                onClick={() => {
                  setIsOpen(false);
                  router.push("/dashboard/profile");
                }}
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <UserIcon className="w-3.5 h-3.5 text-muted-foreground" />
                Profile & Security
              </button>

              <div className="border-t border-border/50 my-1" />

              <button
                onClick={() => {
                  setIsOpen(false);
                  handleLogout();
                }}
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
