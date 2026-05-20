/**
 * Zustand stores untuk global state.
 *
 * PENTING — Anti-redirect-loop pattern:
 * Auth store melacak `_hasHydrated` via `onRehydrateStorage` callback.
 * Dashboard & login page menunggu `_hasHydrated = true` sebelum
 * membuat keputusan redirect, sehingga tidak ada loop.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { User, VMMetrics, WSAlertData } from "@/types";

// ─── Auth Store ───────────────────────────────────────────────────────────────

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  /** True setelah persist selesai load dari localStorage */
  _hasHydrated: boolean;

  setTokens: (access: string, refresh: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
  setHasHydrated: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      _hasHydrated: false,

      setHasHydrated: (v) => set({ _hasHydrated: v }),

      setTokens: (access, refresh) => {
        set({
          accessToken: access,
          refreshToken: refresh,
          isAuthenticated: true,
        });
      },

      setUser: (user) => set({ user }),

      logout: () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },
    }),
    {
      name: "forevim-auth",
      storage: createJSONStorage(() => {
        // SSR-safe: window tidak ada di server
        if (typeof window === "undefined") {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return localStorage;
      }),
      // Hanya persist data auth, BUKAN _hasHydrated
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      // Callback ini dipanggil Zustand SETELAH selesai baca localStorage
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

// ─── Realtime Metrics Store ───────────────────────────────────────────────────

interface RealtimeState {
  metrics: Record<string, VMMetrics>;
  alerts: WSAlertData[];
  wsConnected: boolean;
  updateMetrics: (vmId: string, m: Partial<VMMetrics>) => void;
  addAlert: (alert: WSAlertData) => void;
  setWsConnected: (v: boolean) => void;
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  metrics: {},
  alerts: [],
  wsConnected: false,

  updateMetrics: (vmId, m) =>
    set((state) => ({
      metrics: {
        ...state.metrics,
        [vmId]: { ...(state.metrics[vmId] ?? {}), ...m } as VMMetrics,
      },
    })),

  addAlert: (alert) =>
    set((state) => ({
      alerts: [alert, ...state.alerts].slice(0, 50),
    })),

  setWsConnected: (v) => set({ wsConnected: v }),
}));

// ─── UI Store ─────────────────────────────────────────────────────────────────

interface UIState {
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
