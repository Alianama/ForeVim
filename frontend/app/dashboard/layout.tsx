"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore, useUIStore } from "@/stores";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { useWebSocket } from "@/hooks/useWebSocket";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, _hasHydrated } = useAuthStore();
  const { sidebarOpen } = useUIStore();

  // WebSocket hanya diinisialisasi saat user sudah authenticated
  useWebSocket();

  useEffect(() => {
    // Tunggu sampai Zustand persist selesai baca localStorage (_hasHydrated = true)
    // baru kita cek apakah user sudah login atau belum.
    // Ini mencegah redirect loop karena isAuthenticated = false saat SSR/first render.
    if (_hasHydrated && !isAuthenticated) {
      router.replace("/login");
    }
  }, [_hasHydrated, isAuthenticated, router]);

  // Tampilkan loading saat: (1) persist belum selesai, atau (2) belum authenticated
  if (!_hasHydrated || !isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-2 border-primary/20" />
          <div className="w-12 h-12 rounded-full border-2 border-t-primary animate-spin absolute inset-0" />
        </div>
        <p className="text-muted-foreground text-sm">Memuat dashboard...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div
        className="flex-1 flex flex-col overflow-hidden transition-all duration-300"
        style={{ marginLeft: sidebarOpen ? "256px" : "70px" }}
      >
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
