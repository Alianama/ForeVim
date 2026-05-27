"use client";

import { useState } from "react";
import { Database, Plus, Pencil, Trash2, CheckCircle2, XCircle, Loader2, Settings, AlertCircle, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuthStore } from "@/stores";
import {
  usePrometheusSources,
  useCreatePrometheusSource,
  useUpdatePrometheusSource,
  useDeletePrometheusSource,
} from "@/hooks/useQueries";
import type { PrometheusSource } from "@/types";
import { normalizePrometheusUrl } from "@/lib/prometheus-url";
import { prometheusService } from "@/services";

type FormMode = "create" | "edit";

interface SourceFormState {
  name: string;
  url: string;
  is_active: boolean;
}

const emptyForm: SourceFormState = {
  name: "",
  url: "",
  is_active: true,
};

export default function PrometheusSourcesPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  const { data: sources, isLoading } = usePrometheusSources();
  const createMutation = useCreatePrometheusSource();
  const updateMutation = useUpdatePrometheusSource();
  const deleteMutation = useDeletePrometheusSource();

  const [modalOpen, setModalOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [editingSource, setEditingSource] = useState<PrometheusSource | null>(null);
  const [form, setForm] = useState<SourceFormState>(emptyForm);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [healthMap, setHealthMap] = useState<Record<string, boolean>>({});
  const [selectedType, setSelectedType] = useState<"prometheus" | "influxdb" | "snmp">("prometheus");

  const openCreate = () => {
    setFormMode("create");
    setEditingSource(null);
    setForm(emptyForm);
    setSelectedType("prometheus");
    setModalOpen(true);
  };

  const openEdit = (source: PrometheusSource) => {
    setFormMode("edit");
    setEditingSource(source);
    setForm({
      name: source.name,
      url: source.url,
      is_active: source.is_active,
    });
    setSelectedType("prometheus");
    setModalOpen(true);
  };

  const handleTestConnection = async (source: PrometheusSource) => {
    setTestingId(source.id);
    try {
      await prometheusService.retention(source.id);
      setHealthMap((prev) => ({ ...prev, [source.id]: true }));
      toast.success(`${source.name} connected`);
    } catch {
      setHealthMap((prev) => ({ ...prev, [source.id]: false }));
      toast.error(`Failed to connect to ${source.name}`);
    } finally {
      setTestingId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.url.trim()) {
      toast.error("Name and URL/IP are required");
      return;
    }

    const normalizedUrl = normalizePrometheusUrl(form.url);
    const body = {
      name: form.name.trim(),
      url: normalizedUrl,
      is_active: form.is_active,
    };

    try {
      if (formMode === "create") {
        await createMutation.mutateAsync(body);
        toast.success("Prometheus source added");
      } else if (editingSource) {
        await updateMutation.mutateAsync({ id: editingSource.id, body });
        toast.success("Prometheus source updated");
      }
      setModalOpen(false);
      setForm(emptyForm);
      setEditingSource(null);
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to save source";
      toast.error(typeof detail === "string" ? detail : "Failed to save source");
    }
  };

  const handleDelete = async (source: PrometheusSource) => {
    if (!confirm(`Delete source "${source.name}"? Associated VMs will lose their source reference.`)) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(source.id);
      toast.success("Source deleted");
    } catch {
      toast.error("Failed to delete source");
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6 animate-fade-in pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Database className="w-6 h-6 text-primary" />
            Observability Sources
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage your active metrics telemetry engines (like Prometheus) and review target VM prerequisite instructions.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate} className="flex items-center gap-2 self-start sm:self-auto">
            <Plus className="w-4 h-4" />
            Add Source
          </Button>
        )}
      </div>

      <div className="glass-card overflow-hidden border border-border/80 shadow-sm">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>URL / IP</th>
                <th>Status</th>
                <th>Connection</th>
                {isAdmin && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                [1, 2].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td><div className="h-3 w-28 bg-muted skeleton" /></td>
                    <td><div className="h-3 w-48 bg-muted skeleton" /></td>
                    <td><div className="h-5 w-16 bg-muted skeleton rounded-full" /></td>
                    <td><div className="h-3 w-20 bg-muted skeleton" /></td>
                    {isAdmin && <td><div className="h-3 w-24 bg-muted skeleton" /></td>}
                  </tr>
                ))}

              {!isLoading && sources?.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="text-center py-12 text-muted-foreground text-sm">
                    No sources registered yet.{" "}
                    {isAdmin ? 'Click "Add Source" to add your first Prometheus IP/URL.' : "Please contact the administrator."}
                  </td>
                </tr>
              )}

              {!isLoading &&
                sources?.map((source) => (
                  <tr key={source.id}>
                    <td className="font-semibold text-foreground text-sm">{source.name}</td>
                    <td>
                      <code className="text-xs bg-secondary/60 px-2 py-1 rounded border border-border/60 font-mono">
                        {source.url}
                      </code>
                    </td>
                    <td>
                      <span
                        className={`status-badge ${source.is_active ? "status-healthy" : "status-down"}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {source.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        {healthMap[source.id] === true && (
                          <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5 animate-pulse" /> OK
                          </span>
                        )}
                        {healthMap[source.id] === false && (
                          <span className="flex items-center gap-1 text-xs text-rose-600 font-semibold">
                            <XCircle className="w-3.5 h-3.5" /> Failed
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleTestConnection(source)}
                          disabled={testingId === source.id}
                          className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                        >
                          {testingId === source.id ? (
                            <span className="flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> Checking...
                            </span>
                          ) : (
                            "Test Connection"
                          )}
                        </button>
                      </div>
                    </td>
                    {isAdmin && (
                      <td>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs font-semibold gap-1"
                            onClick={() => openEdit(source)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs font-semibold gap-1 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(source)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {!isAdmin && (
        <p className="text-xs text-muted-foreground">
          Only administrators can add, modify, or delete observability sources.
        </p>
      )}

      {/* ── VM Telemetry Integration Guides & Prerequisites ── */}
      <div className="glass-card p-6 border border-border/80 shadow-md space-y-6 relative overflow-hidden">
        {/* Glowing background accent */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />

        <div className="border-b border-border/40 pb-4">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary animate-pulse" />
            VM Integration & Telemetry Prerequisites
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Follow these step-by-step instructions to configure your Virtual Machines (VMs) so they expose metrics to ForeVim.
          </p>
        </div>

        {/* Source Type Selector Tabs */}
        <div className="flex flex-wrap gap-2">
          <button className="px-4 py-2 rounded-lg bg-primary/10 border border-primary/20 text-xs font-bold text-primary flex items-center gap-1.5 transition-all shadow-sm">
            <Database className="w-3.5 h-3.5" />
            Prometheus (Active Source)
          </button>
          <button className="px-4 py-2 rounded-lg bg-secondary/40 border border-transparent text-xs font-bold text-muted-foreground flex items-center gap-1.5 opacity-60 cursor-not-allowed select-none">
            <Database className="w-3.5 h-3.5" />
            Telegraf & InfluxDB (Coming Soon)
          </button>
          <button className="px-4 py-2 rounded-lg bg-secondary/40 border border-transparent text-xs font-bold text-muted-foreground flex items-center gap-1.5 opacity-60 cursor-not-allowed select-none">
            <Database className="w-3.5 h-3.5" />
            Custom SNMP Agent (Coming Soon)
          </button>
        </div>

        {/* Integration Instructions Content */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start pt-2">
          
          {/* Step 1: Install Node Exporter on VM */}
          <div className="xl:col-span-7 space-y-4">
            <div className="space-y-1">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px]">1</span>
                Step 1: Install node_exporter in your Linux VM
              </h3>
              <p className="text-[11px] text-muted-foreground pl-7 leading-relaxed">
                To capture operating system and hardware metrics, your target virtual machines must run Prometheus <strong>node_exporter</strong> on port <code>9100</code>.
              </p>
            </div>

            <div className="pl-7 space-y-3">
              {/* Copyable script card */}
              <div className="bg-secondary/70 border border-border/80 rounded-xl p-3 space-y-2.5 relative">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Terminal className="w-3 h-3 text-primary" />
                    Automated Systemd Installer Script (Ubuntu/Debian/CentOS)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const script = `wget https://github.com/prometheus/node_exporter/releases/download/v1.7.0/node_exporter-1.7.0.linux-amd64.tar.gz && tar -xvf node_exporter-1.7.0.linux-amd64.tar.gz && sudo mv node_exporter-1.7.0.linux-amd64/node_exporter /usr/local/bin/ && sudo tee /etc/systemd/system/node_exporter.service <<EOF
[Unit]
Description=Node Exporter
After=network.target

[Service]
User=nobody
ExecStart=/usr/local/bin/node_exporter

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload && sudo systemctl enable --now node_exporter`;
                      navigator.clipboard.writeText(script);
                      toast.success("Installation command copied to clipboard!");
                    }}
                    className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    Copy Commands
                  </button>
                </div>
                
                <pre className="text-[10.5px] font-mono text-zinc-100 leading-relaxed bg-zinc-950 p-3 rounded-lg border border-zinc-800/80 overflow-x-auto max-h-[160px]">
{`# Copy & execute inside your VM terminal:
wget https://github.com/prometheus/node_exporter/releases/download/v1.7.0/node_exporter-1.7.0.linux-amd64.tar.gz
tar -xvf node_exporter-1.7.0.linux-amd64.tar.gz
sudo mv node_exporter-1.7.0.linux-amd64/node_exporter /usr/local/bin/

# Register systemd service
sudo tee /etc/systemd/system/node_exporter.service <<EOF
[Unit]
Description=Node Exporter
After=network.target

[Service]
User=nobody
ExecStart=/usr/local/bin/node_exporter

[Install]
WantedBy=multi-user.target
EOF

# Start and enable the exporter
sudo systemctl daemon-reload
sudo systemctl enable --now node_exporter`}
                </pre>
              </div>

              {/* Exporter check */}
              <div className="flex items-start gap-2 text-[11px] text-muted-foreground leading-relaxed bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <strong>Verify Exporter Health</strong>: Run <code>curl http://localhost:9100/metrics</code> inside the VM. You should see a list of raw hardware metrics successfully outputted.
                </div>
              </div>
            </div>
          </div>

          {/* Step 2: Configure Prometheus Scraper */}
          <div className="xl:col-span-5 space-y-4">
            <div className="space-y-1">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px]">2</span>
                Step 2: Add VM target in Prometheus config
              </h3>
              <p className="text-[11px] text-muted-foreground pl-7 leading-relaxed">
                Add the VM as a target inside the <code>/etc/prometheus/prometheus.yml</code> file of your active Prometheus server so it is scraped continuously:
              </p>
            </div>

            <div className="pl-7 space-y-3.5">
              <pre className="text-[10.5px] font-mono text-zinc-100 leading-relaxed bg-zinc-950 p-3.5 rounded-lg border border-zinc-800/80 overflow-x-auto select-all font-semibold">
{`scrape_configs:
  - job_name: 'node-exporter-vms'
    scrape_interval: 15s
    static_configs:
      - targets: ['<YOUR_VM_IP>:9100']`}
              </pre>

              <div className="space-y-2 text-[10.5px] text-muted-foreground leading-relaxed bg-primary/5 border border-primary/20 rounded-lg p-3">
                <div className="flex items-center gap-1.5 font-bold text-foreground text-xs mb-1">
                  <AlertCircle className="w-3.5 h-3.5 text-primary animate-pulse" />
                  Connect to ForeVim:
                </div>
                <p>
                  Once configured, register the Prometheus server URL in the <strong>Sources</strong> list above, and then select this server under your target virtual machine configuration to view active capacity forecasts!
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>

      {modalOpen && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground">
                {formMode === "create" ? "Add Observability Source" : "Edit Observability Source"}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Telemetry Type Selector */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  Telemetry Engine Type <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as any)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring font-medium"
                >
                  <option value="prometheus">Prometheus (Active Source)</option>
                  <option value="influxdb">Telegraf / InfluxDB (Coming Soon)</option>
                  <option value="snmp">Custom SNMP Agent (Coming Soon)</option>
                </select>
              </div>

              {/* Render Prometheus inputs if active */}
              {selectedType === "prometheus" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                      Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Prometheus DC-1"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                      Prometheus IP / URL <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="192.168.1.10:9090 or http://prometheus:9090"
                      value={form.url}
                      onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring font-mono text-zinc-100"
                      required
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Default port is 9090 if not specified. Example: <code>10.0.0.5</code> →{" "}
                      <code>http://10.0.0.5:9090</code>
                    </p>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                      className="rounded border-border"
                    />
                    <span className="text-sm text-foreground">Source active</span>
                  </label>
                </>
              )}

              {/* Render InfluxDB mock fields */}
              {selectedType === "influxdb" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                      InfluxDB Source Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Telegraf InfluxDB DC-1"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring opacity-60 cursor-not-allowed"
                      disabled
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                      InfluxDB URL & Token
                    </label>
                    <input
                      type="text"
                      placeholder="http://localhost:8086"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring font-mono opacity-60 cursor-not-allowed"
                      disabled
                    />
                  </div>

                  <div className="p-3.5 rounded-lg bg-amber-500/5 border border-amber-500/20 space-y-2 select-none">
                    <div className="flex items-center gap-1.5 text-amber-500 text-xs font-bold">
                      <AlertCircle className="w-3.5 h-3.5 animate-pulse" />
                      Telegraf & InfluxDB Roadmap
                    </div>
                    <p className="text-[10.5px] text-muted-foreground leading-relaxed">
                      This telemetry engine is currently in active development. Saving this configuration will be supported in the next patch. Please configure <strong>Prometheus</strong> for active Forecasting right now.
                    </p>
                  </div>
                </>
              )}

              {/* Render SNMP mock fields */}
              {selectedType === "snmp" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                      SNMP Source Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. SNMP Router Agent"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring opacity-60 cursor-not-allowed"
                      disabled
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                      Target IP & Community String
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 192.168.10.1 (Community: public)"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring font-mono opacity-60 cursor-not-allowed"
                      disabled
                    />
                  </div>

                  <div className="p-3.5 rounded-lg bg-amber-500/5 border border-amber-500/20 space-y-2 select-none">
                    <div className="flex items-center gap-1.5 text-amber-500 text-xs font-bold">
                      <AlertCircle className="w-3.5 h-3.5 animate-pulse" />
                      Custom SNMP Agent Roadmap
                    </div>
                    <p className="text-[10.5px] text-muted-foreground leading-relaxed">
                      SNMP scraping configurations will be fully supported in the upcoming enterprise release. Please use <strong>Prometheus</strong> for active forecasting on VMs right now.
                    </p>
                  </div>
                </>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/60">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)} disabled={isSaving}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSaving || selectedType !== "prometheus"} 
                  className="min-w-[100px]"
                >
                  {isSaving ? "Saving..." : formMode === "create" ? "Add" : "Save"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
