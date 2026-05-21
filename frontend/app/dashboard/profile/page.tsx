"use client";

import { useState } from "react";
import { useAuthStore } from "@/stores";
import { authService } from "@/services";
import { toast } from "sonner";
import { 
  ShieldCheck, 
  ShieldAlert, 
  Key, 
  Copy, 
  Check, 
  Lock, 
  User, 
  Calendar, 
  Mail, 
  Shield,
  Loader2
} from "lucide-react";

export default function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"idle" | "setup" | "disable">("idle");
  const [secret, setSecret] = useState("");
  const [provisioningUri, setProvisioningUri] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [copied, setCopied] = useState(false);

  const handleStartSetup = async () => {
    setLoading(true);
    try {
      const data = await authService.setup2fa();
      setSecret(data.secret);
      setProvisioningUri(data.provisioning_uri);
      setStep("setup");
      setTotpCode("");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to initialize 2FA setup");
    } finally {
      setLoading(false);
    }
  };

  const handleEnable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totpCode.trim().length !== 6) {
      toast.error("Please enter a valid 6-digit verification code");
      return;
    }
    setLoading(true);
    try {
      await authService.enable2fa(totpCode);
      
      // Update local store state
      if (user) {
        setUser({
          ...user,
          is_2fa_enabled: true,
        });
      }
      
      toast.success("Two-factor authentication successfully enabled!");
      setStep("idle");
      setSecret("");
      setProvisioningUri("");
      setTotpCode("");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totpCode.trim().length !== 6) {
      toast.error("Please enter a valid 6-digit verification code");
      return;
    }
    setLoading(true);
    try {
      await authService.disable2fa(totpCode);
      
      // Update local store state
      if (user) {
        setUser({
          ...user,
          is_2fa_enabled: false,
        });
      }
      
      toast.success("Two-factor authentication successfully disabled!");
      setStep("idle");
      setTotpCode("");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Invalid verification code. 2FA remains active.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!secret) return;
    navigator.clipboard.writeText(secret);
    setCopied(true);
    toast.success("Secret key copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const qrImageUrl = provisioningUri 
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(provisioningUri)}&color=000000&bgcolor=ffffff&ecc=M`
    : "";

  return (
    <div className="space-y-6 max-w-4xl animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profile & Security</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Manage your personal account credentials and security settings
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Account Details Card */}
        <div className="md:col-span-1 glass-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
                <User className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="font-bold text-foreground text-base">{user?.full_name || user?.username}</h2>
                <p className="text-xs text-muted-foreground capitalize font-medium">{user?.role} Account</p>
              </div>
            </div>

            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-3 py-1 border-b border-border/40">
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Email Address</p>
                  <p className="text-foreground font-medium truncate">{user?.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 py-1 border-b border-border/40">
                <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Username</p>
                  <p className="text-foreground font-medium truncate">{user?.username}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 py-1 border-b border-border/40">
                <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Last Sign In</p>
                  <p className="text-foreground font-medium truncate">
                    {user?.last_login ? new Date(user.last_login).toLocaleString() : "Never"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center text-xs text-muted-foreground border-t border-border/40 pt-4">
            Created: {user?.created_at ? new Date(user.created_at).toLocaleDateString() : "N/A"}
          </div>
        </div>

        {/* Security Settings & 2FA Card */}
        <div className="md:col-span-2 glass-card p-6 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-border/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center border border-border/40">
                <Lock className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <h3 className="font-bold text-foreground text-sm">Two-Factor Authentication (2FA)</h3>
                <p className="text-xs text-muted-foreground">Add an extra layer of security to your session logins</p>
              </div>
            </div>
            {user?.is_2fa_enabled ? (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20">
                <ShieldCheck className="w-3.5 h-3.5" />
                Active
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs font-semibold border border-amber-500/20">
                <ShieldAlert className="w-3.5 h-3.5" />
                Not Enabled
              </span>
            )}
          </div>

          {step === "idle" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Two-factor authentication (2FA) enhances your account security by requiring a six-digit verification code from a TOTP authenticator app in addition to your credentials when signing in.
              </p>
              <div className="p-4 rounded-xl bg-secondary/30 border border-border/50 text-xs text-muted-foreground space-y-2">
                <p className="font-semibold text-foreground">Recommended Authenticator Apps:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Google Authenticator (Android/iOS)</li>
                  <li>Authy by Twilio (Android/iOS/Desktop)</li>
                  <li>1Password / Bitwarden (Cross-platform password managers)</li>
                </ul>
              </div>
              
              <div className="pt-2">
                {user?.is_2fa_enabled ? (
                  <button
                    onClick={() => setStep("disable")}
                    className="py-2 px-4 rounded-lg bg-red-500/10 text-red-400 font-semibold border border-red-500/20
                               hover:bg-red-500/20 transition-all duration-200 text-sm flex items-center gap-2"
                  >
                    Disable Two-Factor Authentication
                  </button>
                ) : (
                  <button
                    onClick={handleStartSetup}
                    disabled={loading}
                    className="py-2.5 px-5 rounded-lg bg-primary text-primary-foreground font-semibold
                               hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed
                               transition-all duration-200 text-sm flex items-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Initializing...
                      </>
                    ) : (
                      "Enable Two-Factor Authentication"
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {step === "setup" && (
            <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
                {/* QR Code */}
                <div className="flex flex-col items-center p-4 bg-white rounded-2xl border-4 border-border shadow-inner self-center mx-auto max-w-[220px]">
                  {qrImageUrl ? (
                    <img 
                      src={qrImageUrl} 
                      alt="Authenticator QR Code" 
                      className="w-full h-auto"
                    />
                  ) : (
                    <div className="w-[200px] h-[200px] bg-secondary flex items-center justify-center text-muted-foreground text-xs">
                      Generating QR...
                    </div>
                  )}
                </div>

                {/* Key Setup Instructions */}
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-foreground text-sm">Scan QR Code</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                      Scan the QR code using your authenticator app. If you cannot scan the QR code, manually enter the secure secret key below.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">Secret Key</label>
                    <div className="flex gap-2">
                      <code className="flex-1 bg-secondary text-foreground text-sm font-mono p-2.5 rounded-lg border border-border/80 text-center select-all tracking-wider">
                        {secret}
                      </code>
                      <button
                        onClick={copyToClipboard}
                        className="p-2.5 rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-all shrink-0"
                        title="Copy Key"
                      >
                        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Verify OTP */}
              <form onSubmit={handleEnable2FA} className="pt-4 border-t border-border/40 space-y-4">
                <div className="max-w-xs space-y-1.5">
                  <label className="text-xs font-semibold text-foreground" htmlFor="otp">
                    Verification Code
                  </label>
                  <input
                    id="otp"
                    type="text"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="Enter 6-digit code"
                    required
                    className="w-full text-center tracking-[0.25em] font-mono px-4 py-2 rounded-lg bg-secondary border border-border text-foreground
                               placeholder-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all text-sm"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="py-2 px-5 rounded-lg bg-primary text-primary-foreground font-semibold
                               hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed
                               transition-all duration-200 text-sm flex items-center gap-2"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Verify & Enable
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStep("idle");
                      setSecret("");
                      setProvisioningUri("");
                      setTotpCode("");
                    }}
                    className="py-2 px-4 rounded-lg bg-secondary text-foreground border border-border
                               hover:bg-secondary/80 transition-all duration-200 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {step === "disable" && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs space-y-1 leading-relaxed">
                <p className="font-semibold">Warning: Disabling 2FA reduces account security</p>
                <p>This action removes the multi-factor requirement. Only your password will be required for future login sessions.</p>
              </div>

              <form onSubmit={handleDisable2FA} className="space-y-4">
                <div className="max-w-xs space-y-1.5">
                  <label className="text-xs font-semibold text-foreground" htmlFor="disable-otp">
                    Confirm with Authenticator Code
                  </label>
                  <input
                    id="disable-otp"
                    type="text"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="Enter 6-digit code"
                    required
                    className="w-full text-center tracking-[0.25em] font-mono px-4 py-2 rounded-lg bg-secondary border border-border text-foreground
                               placeholder-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all text-sm"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="py-2 px-5 rounded-lg bg-red-500 text-white font-semibold
                               hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed
                               transition-all duration-200 text-sm flex items-center gap-2"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Confirm Disable
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStep("idle");
                      setTotpCode("");
                    }}
                    className="py-2 px-4 rounded-lg bg-secondary text-foreground border border-border
                               hover:bg-secondary/80 transition-all duration-200 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
