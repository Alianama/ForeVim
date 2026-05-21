"use client";

import { useState } from "react";
import { Database, Plus, Pencil, Trash2, CheckCircle2, XCircle, Loader2 } from "lucide-react";
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

  const openCreate = () => {
    setFormMode("create");
    setEditingSource(null);
    setForm(emptyForm);
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
    setModalOpen(true);
  };

  const handleTestConnection = async (source: PrometheusSource) => {
    setTestingId(source.id);
    try {
      await prometheusService.retention(source.id);
      setHealthMap((prev) => ({ ...prev, [source.id]: true }));
      toast.success(`${source.name} terhubung`);
    } catch {
      setHealthMap((prev) => ({ ...prev, [source.id]: false }));
      toast.error(`Gagal terhubung ke ${source.name}`);
    } finally {
      setTestingId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.url.trim()) {
      toast.error("Nama dan URL/IP wajib diisi");
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
        toast.success("Prometheus source ditambahkan");
      } else if (editingSource) {
        await updateMutation.mutateAsync({ id: editingSource.id, body });
        toast.success("Prometheus source diperbarui");
      }
      setModalOpen(false);
      setForm(emptyForm);
      setEditingSource(null);
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Gagal menyimpan source";
      toast.error(typeof detail === "string" ? detail : "Gagal menyimpan source");
    }
  };

  const handleDelete = async (source: PrometheusSource) => {
    if (!confirm(`Hapus source "${source.name}"? VM yang terkait akan kehilangan referensi source.`)) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(source.id);
      toast.success("Source dihapus");
    } catch {
      toast.error("Gagal menghapus source");
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Database className="w-6 h-6 text-primary" />
            Prometheus Sources
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Kelola satu atau lebih server Prometheus (IP/URL). VM akan mengambil metrik dari source yang dipilih.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate} className="flex items-center gap-2 self-start sm:self-auto">
            <Plus className="w-4 h-4" />
            Tambah Source
          </Button>
        )}
      </div>

      <div className="glass-card overflow-hidden border border-border/80 shadow-sm">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>URL / IP</th>
                <th>Status</th>
                <th>Koneksi</th>
                {isAdmin && <th>Aksi</th>}
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
                    Belum ada Prometheus source.{" "}
                    {isAdmin ? "Klik \"Tambah Source\" untuk menambahkan IP Prometheus pertama." : "Hubungi administrator."}
                  </td>
                </tr>
              )}

              {!isLoading &&
                sources?.map((source) => (
                  <tr key={source.id}>
                    <td className="font-semibold text-foreground text-sm">{source.name}</td>
                    <td>
                      <code className="text-xs bg-secondary/60 px-2 py-1 rounded border border-border/60">
                        {source.url}
                      </code>
                    </td>
                    <td>
                      <span
                        className={`status-badge ${source.is_active ? "status-healthy" : "status-down"}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {source.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        {healthMap[source.id] === true && (
                          <span className="flex items-center gap-1 text-xs text-emerald-600">
                            <CheckCircle2 className="w-3.5 h-3.5" /> OK
                          </span>
                        )}
                        {healthMap[source.id] === false && (
                          <span className="flex items-center gap-1 text-xs text-rose-600">
                            <XCircle className="w-3.5 h-3.5" /> Gagal
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleTestConnection(source)}
                          disabled={testingId === source.id}
                          className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                        >
                          {testingId === source.id ? (
                            <span className="flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> Mengecek...
                            </span>
                          ) : (
                            "Tes koneksi"
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
                            Hapus
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
          Hanya admin yang dapat menambah, mengubah, atau menghapus Prometheus source.
        </p>
      )}

      {modalOpen && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground">
                {formMode === "create" ? "Tambah Prometheus Source" : "Edit Prometheus Source"}
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
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  Nama <span className="text-rose-500">*</span>
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
                  IP / URL Prometheus <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="192.168.1.10:9090 atau http://prometheus:9090"
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                  required
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Port default 9090 jika tidak ditulis. Contoh: <code>10.0.0.5</code> →{" "}
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
                <span className="text-sm text-foreground">Source aktif</span>
              </label>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/60">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)} disabled={isSaving}>
                  Batal
                </Button>
                <Button type="submit" disabled={isSaving} className="min-w-[100px]">
                  {isSaving ? "Menyimpan..." : formMode === "create" ? "Tambah" : "Simpan"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
