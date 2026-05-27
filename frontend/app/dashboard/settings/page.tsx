"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationService } from "@/services";
import type { NotificationConfig } from "@/types";
import {
  Settings,
  Bell,
  Send,
  Mail,
  Network,
  SlidersHorizontal,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Loader2,
  Save,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

// ── Helpers ───────────────────────────────────────────────────────────────────

type TabId = "thresholds" | "telegram" | "email" | "snmp";

const TABS: { id: TabId; label: string; icon: React.ReactNode; desc: string }[] = [
  {
    id: "thresholds",
    label: "Thresholds",
    icon: <SlidersHorizontal className="w-4 h-4" />,
    desc: "Configure alert thresholds per metric",
  },
  {
    id: "telegram",
    label: "Telegram",
    icon: <Send className="w-4 h-4" />,
    desc: "Send alerts to a Telegram Bot",
  },
  {
    id: "email",
    label: "Email (SMTP)",
    icon: <Mail className="w-4 h-4" />,
    desc: "Send alert emails via SMTP",
  },
  {
    id: "snmp",
    label: "SNMP",
    icon: <Network className="w-4 h-4" />,
    desc: "Configure SNMP trap settings",
  },
];

function MaskedInput({
  label,
  value,
  onChange,
  placeholder,
  id,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id: string;
  type?: string;
}) {
  const [show, setShow] = useState(false);
  const isSecret = type === "password";
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isSecret && !show ? "password" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="new-password"
          className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all pr-10"
        />
        {isSecret && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
        checked ? "bg-primary" : "bg-border"
      }`}
    >
      <span className="sr-only">{label}</span>
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function ThresholdSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  colorClass,
  id,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  colorClass: string;
  id: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm text-muted-foreground font-medium">
          {label}
        </label>
        <span className={`text-sm font-bold tabular-nums ${colorClass}`}>{value}%</span>
      </div>
      <div className="relative h-2 bg-border rounded-full overflow-hidden">
        <div
          className={`absolute left-0 top-0 h-full rounded-full transition-all ${colorClass.includes("amber") ? "bg-amber-500" : "bg-red-500"}`}
          style={{ width: `${value}%` }}
        />
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
}

function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
        enabled
          ? "bg-emerald-500/15 text-emerald-500"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {enabled ? (
        <CheckCircle2 className="w-3 h-3" />
      ) : (
        <XCircle className="w-3 h-3" />
      )}
      {enabled ? "Configured" : "Disabled"}
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>("thresholds");
  const [form, setForm] = useState<Partial<NotificationConfig>>({});
  const [isTesting, setIsTesting] = useState<"telegram" | "email" | null>(null);

  const { data: config, isLoading } = useQuery({
    queryKey: ["notification-config"],
    queryFn: () => notificationService.getConfig(),
  });

  useEffect(() => {
    if (config) {
      setForm(config);
    }
  }, [config]);

  const mutation = useMutation({
    mutationFn: (data: Partial<NotificationConfig>) =>
      notificationService.updateConfig(data),
    onSuccess: (data) => {
      queryClient.setQueryData(["notification-config"], data);
      toast.success("Configuration successfully saved! ✅");
    },
    onError: () => {
      toast.error("Failed to save configuration");
    },
  });

  const set = useCallback(
    <K extends keyof NotificationConfig>(key: K, value: NotificationConfig[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleSave = () => {
    mutation.mutate(form);
  };

  const handleTestTelegram = async () => {
    setIsTesting("telegram");
    try {
      const res = await notificationService.testTelegram();
      toast.success(res.message);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to send Telegram test message");
    } finally {
      setIsTesting(null);
    }
  };

  const handleTestEmail = async () => {
    setIsTesting("email");
    try {
      const res = await notificationService.testEmail();
      toast.success(res.message);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to send Email test message");
    } finally {
      setIsTesting(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const f = form as NotificationConfig;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Settings className="w-6 h-6 text-primary" />
            Notification Settings
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Configure alert thresholds and notification channels
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 shadow-lg shadow-primary/20"
        >
          {mutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {mutation.isPending ? "Saving..." : "Save All"}
        </button>
      </div>

      <div className="flex gap-6">
        {/* Sidebar tabs */}
        <div className="w-56 shrink-0 flex flex-col gap-1">
          {TABS.map((tab) => {
            const isConfigured =
              tab.id === "telegram"
                ? f.telegram_enabled
                : tab.id === "email"
                ? f.email_enabled
                : tab.id === "snmp"
                ? f.snmp_enabled
                : null;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-start gap-3 px-3 py-3 rounded-xl text-left transition-all group ${
                  activeTab === tab.id
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground border border-transparent"
                }`}
              >
                <span className="mt-0.5 shrink-0">{tab.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">{tab.label}</span>
                    {isConfigured !== null && <StatusBadge enabled={!!isConfigured} />}
                  </div>
                  <span className="text-[11px] text-muted-foreground leading-tight block mt-0.5 truncate">
                    {tab.desc}
                  </span>
                </div>
                <ChevronRight
                  className={`w-3.5 h-3.5 shrink-0 mt-0.5 transition-transform ${
                    activeTab === tab.id ? "text-primary" : "text-muted-foreground/40"
                  }`}
                />
              </button>
            );
          })}
        </div>

        {/* Content panel */}
        <div className="flex-1 glass-card p-6 space-y-6">
          {/* ── Thresholds ──────────────────────────────────────────────── */}
          {activeTab === "thresholds" && (
            <>
              <div>
                <h2 className="text-base font-semibold text-foreground">Alert Thresholds</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Define threshold values to trigger notifications. The <span className="text-amber-500 font-semibold">High</span> value triggers a warning, while <span className="text-red-500 font-semibold">Critical</span> triggers an emergency alert.
                </p>
              </div>

              {/* Notify toggles */}
              <div className="flex gap-4">
                <div className="flex-1 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-amber-500">Notify on High</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Send notification when status is High</p>
                  </div>
                  <Toggle
                    checked={f.notify_on_high ?? true}
                    onChange={(v) => set("notify_on_high", v)}
                    label="Notify on High"
                  />
                </div>
                <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-red-500">Notify on Critical</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Send notification when status is Critical</p>
                  </div>
                  <Toggle
                    checked={f.notify_on_critical ?? true}
                    onChange={(v) => set("notify_on_critical", v)}
                    label="Notify on Critical"
                  />
                </div>
              </div>

              {/* CPU */}
              <div className="space-y-4 bg-secondary/40 rounded-xl p-4 border border-border/60">
                <p className="text-sm font-bold text-foreground flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-sky-500" />
                  CPU Usage
                </p>
                <ThresholdSlider
                  id="cpu-high"
                  label="High Threshold"
                  value={f.cpu_high_threshold ?? 70}
                  onChange={(v) => set("cpu_high_threshold", v)}
                  colorClass="text-amber-500"
                />
                <ThresholdSlider
                  id="cpu-critical"
                  label="Critical Threshold"
                  value={f.cpu_critical_threshold ?? 90}
                  onChange={(v) => set("cpu_critical_threshold", v)}
                  colorClass="text-red-500"
                />
              </div>

              {/* RAM */}
              <div className="space-y-4 bg-secondary/40 rounded-xl p-4 border border-border/60">
                <p className="text-sm font-bold text-foreground flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-violet-500" />
                  RAM Usage
                </p>
                <ThresholdSlider
                  id="ram-high"
                  label="High Threshold"
                  value={f.ram_high_threshold ?? 75}
                  onChange={(v) => set("ram_high_threshold", v)}
                  colorClass="text-amber-500"
                />
                <ThresholdSlider
                  id="ram-critical"
                  label="Critical Threshold"
                  value={f.ram_critical_threshold ?? 90}
                  onChange={(v) => set("ram_critical_threshold", v)}
                  colorClass="text-red-500"
                />
              </div>

              {/* Disk */}
              <div className="space-y-4 bg-secondary/40 rounded-xl p-4 border border-border/60">
                <p className="text-sm font-bold text-foreground flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Disk Usage
                </p>
                <ThresholdSlider
                  id="disk-high"
                  label="High Threshold"
                  value={f.disk_high_threshold ?? 70}
                  onChange={(v) => set("disk_high_threshold", v)}
                  colorClass="text-amber-500"
                />
                <ThresholdSlider
                  id="disk-critical"
                  label="Critical Threshold"
                  value={f.disk_critical_threshold ?? 85}
                  onChange={(v) => set("disk_critical_threshold", v)}
                  colorClass="text-red-500"
                />
              </div>

              {/* Frontend URL */}
              <div>
                <MaskedInput
                  id="frontend-url"
                  label="Frontend URL (for deep-linking in notifications)"
                  value={f.frontend_url ?? "http://localhost:3000"}
                  onChange={(v) => set("frontend_url", v)}
                  placeholder="https://forevim.example.com"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  This URL will be included in the notification message as a direct link to the VM.
                </p>
              </div>
            </>
          )}

          {/* ── Telegram ────────────────────────────────────────────────── */}
          {activeTab === "telegram" && (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Telegram Bot</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Send alerts to a specific Telegram channel, group, or thread.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Enable</span>
                  <Toggle
                    checked={f.telegram_enabled ?? false}
                    onChange={(v) => set("telegram_enabled", v)}
                    label="Enable Telegram"
                  />
                </div>
              </div>

              {!f.telegram_enabled && (
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Enable the toggle above to use Telegram notifications.
                </div>
              )}

              <div className={`space-y-4 transition-opacity ${f.telegram_enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
                <MaskedInput
                  id="telegram-token"
                  label="Bot Token"
                  value={f.telegram_bot_token ?? ""}
                  onChange={(v) => set("telegram_bot_token", v)}
                  placeholder="1234567890:AAF..."
                  type="password"
                />
                <MaskedInput
                  id="telegram-chat-id"
                  label="Chat ID / Channel ID"
                  value={f.telegram_chat_id ?? ""}
                  onChange={(v) => set("telegram_chat_id", v)}
                  placeholder="-1001234567890"
                />
                <MaskedInput
                  id="telegram-thread-id"
                  label="Thread ID (optional — for group topics)"
                  value={f.telegram_thread_id ?? ""}
                  onChange={(v) => set("telegram_thread_id", v)}
                  placeholder="Leave empty if not using topics"
                />

                <div className="bg-secondary/30 rounded-xl p-4 text-xs text-muted-foreground space-y-1.5 border border-border/50">
                  <p className="font-semibold text-foreground text-sm">How to get a Bot Token:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Open <span className="text-primary">@BotFather</span> on Telegram</li>
                    <li>Type <code className="bg-muted px-1 rounded">/newbot</code> and follow the instructions</li>
                    <li>Copy the provided token and paste it above</li>
                    <li>Add the bot to a group/channel and grant admin access</li>
                    <li>For Chat ID: forward a message to <span className="text-primary">@userinfobot</span></li>
                  </ol>
                </div>

                <button
                  onClick={handleTestTelegram}
                  disabled={isTesting === "telegram" || !f.telegram_bot_token || !f.telegram_chat_id}
                  className="flex items-center gap-2 px-4 py-2.5 bg-sky-500/10 border border-sky-500/30 text-sky-500 rounded-lg text-sm font-semibold hover:bg-sky-500/20 transition-all disabled:opacity-50"
                >
                  {isTesting === "telegram" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {isTesting === "telegram" ? "Sending..." : "Send Test Message"}
                </button>
              </div>
            </>
          )}

          {/* ── Email ───────────────────────────────────────────────────── */}
          {activeTab === "email" && (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Email (SMTP)</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Send alert emails with a premium HTML template.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Enable</span>
                  <Toggle
                    checked={f.email_enabled ?? false}
                    onChange={(v) => set("email_enabled", v)}
                    label="Enable Email"
                  />
                </div>
              </div>

              {!f.email_enabled && (
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Enable the toggle above to use Email notifications.
                </div>
              )}

              <div className={`space-y-4 transition-opacity ${f.email_enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
                <div className="grid grid-cols-2 gap-4">
                  <MaskedInput
                    id="smtp-host"
                    label="SMTP Host"
                    value={f.smtp_host ?? ""}
                    onChange={(v) => set("smtp_host", v)}
                    placeholder="smtp.gmail.com"
                  />
                  <MaskedInput
                    id="smtp-port"
                    label="SMTP Port"
                    value={String(f.smtp_port ?? 587)}
                    onChange={(v) => set("smtp_port", Number(v))}
                    placeholder="587"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <MaskedInput
                    id="smtp-username"
                    label="Username"
                    value={f.smtp_username ?? ""}
                    onChange={(v) => set("smtp_username", v)}
                    placeholder="user@gmail.com"
                  />
                  <MaskedInput
                    id="smtp-password"
                    label="Password / App Password"
                    value={f.smtp_password ?? ""}
                    onChange={(v) => set("smtp_password", v)}
                    placeholder="••••••••••••"
                    type="password"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <MaskedInput
                    id="smtp-from"
                    label="From Email"
                    value={f.smtp_from_email ?? ""}
                    onChange={(v) => set("smtp_from_email", v)}
                    placeholder="forevim@example.com"
                  />
                  <div className="flex items-end gap-3">
                    <div className="flex items-center gap-2 pb-2.5">
                      <Toggle
                        checked={f.smtp_use_tls ?? true}
                        onChange={(v) => set("smtp_use_tls", v)}
                        label="TLS"
                      />
                      <span className="text-sm text-muted-foreground font-medium">Use TLS (STARTTLS)</span>
                    </div>
                  </div>
                </div>
                <MaskedInput
                  id="smtp-to"
                  label="Email Recipients (separated by comma)"
                  value={f.smtp_to_emails ?? ""}
                  onChange={(v) => set("smtp_to_emails", v)}
                  placeholder="admin@example.com, ops@example.com"
                />

                <div className="bg-secondary/30 rounded-xl p-4 text-xs text-muted-foreground space-y-1.5 border border-border/50">
                  <p className="font-semibold text-foreground text-sm">Gmail Tips:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Use an <strong>App Password</strong> instead of a regular password</li>
                    <li>Enable 2-Step Verification first in your Google account</li>
                    <li>Host: <code className="bg-muted px-1 rounded">smtp.gmail.com</code>, Port: <code className="bg-muted px-1 rounded">587</code>, TLS: On</li>
                  </ul>
                </div>

                <button
                  onClick={handleTestEmail}
                  disabled={isTesting === "email" || !f.smtp_host || !f.smtp_to_emails}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 rounded-lg text-sm font-semibold hover:bg-emerald-500/20 transition-all disabled:opacity-50"
                >
                  {isTesting === "email" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Mail className="w-4 h-4" />
                  )}
                  {isTesting === "email" ? "Sending..." : "Send Test Email"}
                </button>
              </div>
            </>
          )}

          {/* ── SNMP ────────────────────────────────────────────────────── */}
          {activeTab === "snmp" && (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-base font-semibold text-foreground">SNMP Trap</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Send SNMP trap to a network management system (NMS).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Enable</span>
                  <Toggle
                    checked={f.snmp_enabled ?? false}
                    onChange={(v) => set("snmp_enabled", v)}
                    label="Enable SNMP"
                  />
                </div>
              </div>

              {!f.snmp_enabled && (
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Enable the toggle above to use SNMP traps.
                </div>
              )}

              <div className={`space-y-4 transition-opacity ${f.snmp_enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
                <div className="grid grid-cols-2 gap-4">
                  <MaskedInput
                    id="snmp-host"
                    label="SNMP Manager Host"
                    value={f.snmp_host ?? ""}
                    onChange={(v) => set("snmp_host", v)}
                    placeholder="192.168.1.100"
                  />
                  <MaskedInput
                    id="snmp-port"
                    label="Port"
                    value={String(f.snmp_port ?? 162)}
                    onChange={(v) => set("snmp_port", Number(v))}
                    placeholder="162"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <MaskedInput
                    id="snmp-community"
                    label="Community String"
                    value={f.snmp_community ?? "public"}
                    onChange={(v) => set("snmp_community", v)}
                    placeholder="public"
                    type="password"
                  />
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      SNMP Version
                    </label>
                    <select
                      value={f.snmp_version ?? "2c"}
                      onChange={(e) => set("snmp_version", e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                    >
                      <option value="1">SNMPv1</option>
                      <option value="2c">SNMPv2c</option>
                      <option value="3">SNMPv3</option>
                    </select>
                  </div>
                </div>

                <div className="bg-secondary/30 rounded-xl p-4 text-xs text-muted-foreground space-y-1 border border-border/50">
                  <p className="font-semibold text-foreground text-sm">SNMP Note:</p>
                  <p>SNMP trap will be sent to the host above when an alert occurs. Ensure your NMS accepts traps from the ForeVim server IP. The backend requires the pysnmp library for this feature (coming soon).</p>
                </div>
              </div>

              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <div className="flex items-center gap-2 text-amber-500 text-sm font-semibold">
                  <Bell className="w-4 h-4" />
                  SNMP Trap — Coming Soon
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Configurations can be saved now. Actual SNMP trap delivery will be available in the next update.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
