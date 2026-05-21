"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores";
import { authService } from "@/services";
import { toast } from "sonner";
import { Eye, EyeOff, Server, Activity, ShieldCheck, ArrowLeft } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { setTokens, setUser, isAuthenticated, _hasHydrated } = useAuthStore();
  const [email, setEmail] = useState("admin@forevim.io");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // 2FA state variables
  const [totpRequired, setTotpRequired] = useState(false);
  const [mfaToken, setMfaToken] = useState("");
  const [totpCode, setTotpCode] = useState("");

  useEffect(() => {
    // Redirect to dashboard only after store hydrates from localStorage
    if (_hasHydrated && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [_hasHydrated, isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await authService.login({ email, password });
      if (response.totp_required) {
        setTotpRequired(true);
        setMfaToken(response.mfa_token || "");
        toast.info("Two-factor authentication is active. Please enter your 6-digit code.");
        setLoading(false);
        return;
      }

      setTokens(response.access_token!, response.refresh_token!);
      const user = await authService.me();
      setUser(user);
      toast.success(`Welcome back, ${user.full_name || user.username}!`);
      router.replace("/dashboard");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totpCode.trim().length !== 6) {
      toast.error("Please enter a valid 6-digit code");
      return;
    }
    setLoading(true);
    try {
      const tokens = await authService.verify2fa(mfaToken, totpCode);
      setTokens(tokens.access_token, tokens.refresh_token);
      const user = await authService.me();
      setUser(user);
      toast.success(`Welcome back, ${user.full_name || user.username}!`);
      router.replace("/dashboard");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Invalid or expired verification code");
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setTotpRequired(false);
    setMfaToken("");
    setTotpCode("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse-slow delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-violet-500/5 rounded-full blur-3xl" />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--border)) 1px, transparent 1px),
                            linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Login Card */}
      <div className="relative w-full max-w-md p-8 glass-card animate-fade-in mx-4">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold gradient-text">ForeVim</h1>
            <p className="text-xs text-muted-foreground">VM Monitoring & Forecasting</p>
          </div>
        </div>

        {!totpRequired ? (
          <>
            <h2 className="text-2xl font-bold text-foreground mb-1">Sign in</h2>
            <p className="text-muted-foreground text-sm mb-8">
              Access your observability dashboard
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-foreground
                             placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50
                             focus:border-primary/50 transition-all text-sm"
                  placeholder="admin@forevim.io"
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 pr-11 rounded-lg bg-secondary border border-border text-foreground
                               placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50
                               focus:border-primary/50 transition-all text-sm"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground font-semibold
                           hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed
                           transition-all duration-200 flex items-center justify-center gap-2 text-sm"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-primary mb-2 text-sm font-semibold">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <span>Two-Factor Authentication</span>
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-1">Enter Verification Code</h2>
            <p className="text-muted-foreground text-sm mb-8">
              Open your authenticator app (like Google Authenticator or 1Password) to view your 6-digit verification code.
            </p>

            <form onSubmit={handleVerify2FA} className="space-y-5">
              {/* TOTP Code */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground text-center block" htmlFor="totpCode">
                  6-Digit Authenticator Code
                </label>
                <input
                  id="totpCode"
                  type="text"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  required
                  autoFocus
                  className="w-full text-center text-2xl tracking-[0.75em] font-mono px-4 py-3 rounded-lg bg-secondary border border-border text-foreground
                             placeholder-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/50
                             focus:border-primary/50 transition-all"
                  placeholder="000000"
                />
              </div>

              {/* Verify Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground font-semibold
                           hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed
                           transition-all duration-200 flex items-center justify-center gap-2 text-sm"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify & Log in"
                )}
              </button>

              {/* Back to Login */}
              <button
                type="button"
                onClick={handleBackToLogin}
                className="w-full py-2 flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
              >
                <ArrowLeft size={16} />
                Back to Sign in
              </button>
            </form>
          </>
        )}

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-border text-center">
          <p className="text-xs text-muted-foreground">
            ForeVim v1.0 · Enterprise VM Observability
          </p>
        </div>
      </div>
    </div>
  );
}

