"use client";

import { useUsers } from "@/hooks/useQueries";
import { UsersIcon, PlusIcon, UserIcon, SettingsIcon } from "@animateicons/react/lucide";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { userService } from "@/services";

export default function UsersPage() {
  const { data: users, isLoading, isError, error } = useUsers();
  const qc = useQueryClient();

  // Add User Form States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("viewer");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !email.trim() || !password.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    try {
      await userService.create({
        username: username.trim(),
        full_name: fullName.trim() || null,
        email: email.trim(),
        password: password.trim(),
        role
      });
      toast.success("User created successfully!");
      // Reset form fields
      setUsername("");
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("viewer");
      setIsModalOpen(false);
      // Invalidate users list query
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (err: any) {
      const errMsg = err.response?.data?.detail || "Failed to create user";
      toast.error(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  if (isError) {
    return (
      <div className="h-[calc(100vh-10rem)] flex flex-col items-center justify-center p-6 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center border border-border mb-4">
          <ShieldAlert size={28} className="text-foreground" />
        </div>
        <h2 className="text-xl font-bold tracking-tight">Access Denied</h2>
        <p className="text-sm text-muted-foreground max-w-sm mt-2">
          Administrative privileges are required to view and manage users and roles. If you believe this is an error, please contact your Super Administrator.
        </p>
        <Button variant="outline" onClick={() => window.history.back()} className="mt-6">
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <UsersIcon size={24} className="text-foreground" />
            Users & Roles
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage administrative access, permissions, and roles.
          </p>
        </div>
        {!isLoading && (
          <Button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 text-sm font-medium self-start sm:self-auto"
          >
            <PlusIcon size={14} />
            Add User
          </Button>
        )}
      </div>

      <div className="glass-card overflow-hidden border border-border/80 shadow-sm">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <>
                  {[1, 2, 3].map((i) => (
                    <tr key={i} className="animate-pulse">
                       <td>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-muted skeleton" />
                          <div className="space-y-1.5">
                            <div className="h-3 w-24 bg-muted skeleton" />
                            <div className="h-2 w-16 bg-muted skeleton" />
                          </div>
                        </div>
                      </td>
                      <td><div className="h-3 w-32 bg-muted skeleton" /></td>
                      <td><div className="h-5 w-16 bg-muted skeleton rounded-full" /></td>
                      <td><div className="h-5 w-14 bg-muted skeleton rounded-full" /></td>
                      <td><div className="h-3 w-20 bg-muted skeleton" /></td>
                      <td><div className="h-4 w-12 bg-muted skeleton" /></td>
                    </tr>
                  ))}
                </>
              )}
              
              {!isLoading && users?.map((u: any) => (
                <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center border border-border">
                        <UserIcon size={14} className="text-foreground" />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground text-sm">{u.full_name || u.username}</div>
                        <div className="text-[10px] text-muted-foreground">@{u.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-muted-foreground text-xs">{u.email}</td>
                  <td>
                    <span className="capitalize text-xs font-semibold px-2.5 py-0.5 rounded-full border bg-secondary/80 text-foreground border-border">
                      {u.role}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${u.is_active ? 'status-healthy' : 'status-down'}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {u.is_active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="text-xs text-muted-foreground">
                    {u.last_login ? formatDistanceToNow(new Date(u.last_login), { addSuffix: true }) : "Never"}
                  </td>
                  <td>
                    <Button variant="ghost" size="sm" className="h-8 text-xs font-semibold flex items-center gap-1">
                      <SettingsIcon size={12} />
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-lg overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground">Create New User</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  Username <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. janesmith"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Jane Smith"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  placeholder="e.g. jane@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  Password <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-all"
                  required
                  minLength={8}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  Role <span className="text-rose-500">*</span>
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-all cursor-pointer"
                >
                  <option value="viewer">Viewer (Read-only)</option>
                  <option value="admin">Administrator (Read & Write)</option>
                  <option value="superadmin">Super Administrator (Full Access)</option>
                </select>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/60">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-primary text-primary-foreground font-semibold flex items-center justify-center min-w-[80px]"
                >
                  {submitting ? "Creating..." : "Create User"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
