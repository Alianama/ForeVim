"use client";

import { useRouter, usePathname } from "next/navigation";
import {
  ActivityIcon,
  BellIcon,
  SettingsIcon,
  LogoutIcon,
} from "@animateicons/react/lucide";
import { ChevronLeft, ChevronRight, Server, BarChart2 } from "lucide-react";
import { useAuthStore, useUIStore } from "@/stores";
import { useAlerts } from "@/hooks/useQueries";

const NAV_ITEMS = [
  { href: "/dashboard", icon: ActivityIcon, label: "Overview" },
  { href: "/dashboard/vms", icon: Server, label: "Virtual Machines" },
  { href: "/dashboard/alerts", icon: BellIcon, label: "Alerts" },
  { href: "/dashboard/forecasting", icon: BarChart2, label: "Forecasting" },
  { href: "/dashboard/users", icon: SettingsIcon, label: "Users & Roles" },
];

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const { data: alerts } = useAlerts(undefined, "active");
  const alertCount = alerts?.filter((a) => a.severity === "critical").length ?? 0;

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  // Filter NAV_ITEMS so that only admin or superadmin can see the "Users & Roles" link
  const filteredNavItems = NAV_ITEMS.filter((item) => {
    if (item.href === "/dashboard/users") {
      return user?.role === "admin" || user?.role === "superadmin";
    }
    return true;
  });

  return (
    <aside
      className={`fixed left-0 top-0 h-full z-40 flex flex-col transition-all duration-300
                  bg-card border-r border-border ${sidebarOpen ? "w-64" : "w-[70px]"}`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-border overflow-hidden">
        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 border border-border/40">
          <ActivityIcon size={16} className="text-foreground" />
        </div>
        {sidebarOpen && (
          <div className="overflow-hidden">
            <span className="font-bold gradient-text text-sm whitespace-nowrap">ForeVim</span>
            <p className="text-[10px] text-muted-foreground whitespace-nowrap">Observability Platform</p>
          </div>
        )}
      </div>

      {/* Nav Items */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {filteredNavItems.map(({ href, icon: Icon, label }) => {
          const isActive =
            href === "/dashboard" ? pathname === href : pathname.startsWith(href);
          return (
            <button
              key={href}
              onClick={() => router.push(href)}
              className={`nav-item w-full group ${isActive ? "active" : ""} ${
                !sidebarOpen ? "justify-center px-2" : ""
              }`}
              title={!sidebarOpen ? label : undefined}
            >
              <div className="relative shrink-0 flex items-center justify-center">
                <Icon size={16} />
                {label === "Alerts" && alertCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-foreground border border-background text-background rounded-full text-[8px] flex items-center justify-center font-bold">
                    {alertCount > 9 ? "9+" : alertCount}
                  </span>
                )}
              </div>
              {sidebarOpen && (
                <span className="truncate">{label}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div className="px-2 py-3 border-t border-border space-y-1">
        {sidebarOpen && user && (
          <div className="px-3 py-2.5 rounded-lg bg-secondary/50 mb-2 border border-border/40">
            <p className="text-xs font-semibold truncate text-foreground">{user.full_name || user.username}</p>
            <p className="text-[9px] text-muted-foreground truncate capitalize font-medium">{user.role}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={`nav-item w-full hover:text-destructive ${!sidebarOpen ? "justify-center px-2" : ""}`}
          title={!sidebarOpen ? "Logout" : undefined}
        >
          <LogoutIcon size={16} className="shrink-0" />
          {sidebarOpen && <span>Logout</span>}
        </button>
      </div>

      {/* Toggle Button */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full
                   bg-card border border-border flex items-center justify-center
                   hover:bg-secondary transition-colors z-50 shadow-sm"
      >
        {sidebarOpen ? (
          <ChevronLeft className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        )}
      </button>
    </aside>
  );
}
