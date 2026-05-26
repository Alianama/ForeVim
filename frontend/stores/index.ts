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
import type {
  User,
  VMMetrics,
  WSAlertData,
  ForecastScanState,
  ForecastScanStartData,
  ForecastScanProgressData,
  ForecastScanCompleteData,
  ScanJobEvent,
} from "@/types";

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
    },
  ),
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

// ─── Forecast Scan Store ──────────────────────────────────────────────────────

const INITIAL_SCAN_STATE: ForecastScanState = {
  isRunning: false,
  scanId: null,
  total: 0,
  completed: 0,
  errors: 0,
  vmCount: 0,
  algorithm: "",
  periodDays: 7,
  events: [],
};

interface ForecastScanStoreState {
  scan: ForecastScanState;
  onScanStart: (data: ForecastScanStartData) => void;
  onScanProgress: (data: ForecastScanProgressData) => void;
  onScanComplete: (data: ForecastScanCompleteData) => void;
  resetScan: () => void;
}

export const useForecastScanStore = create<ForecastScanStoreState>((set) => ({
  scan: INITIAL_SCAN_STATE,

  onScanStart: (data) =>
    set({
      scan: {
        isRunning: true,
        scanId: data.scan_id,
        total: data.total,
        completed: 0,
        errors: 0,
        vmCount: data.vm_count,
        algorithm: data.algorithm,
        periodDays: data.period_days,
        events: [],
      },
    }),

  onScanProgress: (data) =>
    set((state) => {
      const event: ScanJobEvent = {
        vm_id: data.vm_id,
        hostname: data.hostname,
        metric: data.metric,
        algorithm: data.algorithm,
        status: data.status,
        error: data.error,
        ts: Date.now(),
      };
      // Only add terminal events (done/error) and running to avoid duplicate "running" spam
      const shouldAdd = data.status === "done" || data.status === "error";
      return {
        scan: {
          ...state.scan,
          completed: data.completed,
          events: shouldAdd
            ? [event, ...state.scan.events].slice(0, 200)
            : state.scan.events,
        },
      };
    }),

  onScanComplete: (data) =>
    set((state) => ({
      scan: {
        ...state.scan,
        isRunning: false,
        completed: data.completed,
        errors: data.errors,
      },
    })),

  resetScan: () => set({ scan: INITIAL_SCAN_STATE }),
}));
