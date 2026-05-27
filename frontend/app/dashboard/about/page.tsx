"use client";

import { 
  Heart, 
  Github, 
  Globe, 
  Mail, 
  ExternalLink, 
  Coffee, 
  Sparkles, 
  Terminal, 
  Server, 
  Cpu, 
  Database,
  Info
} from "lucide-react";
import { useAuthStore } from "@/stores";

export default function AboutPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="space-y-8 max-w-5xl animate-fade-in pb-12">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Info className="w-6 h-6 text-primary animate-pulse" />
            About & Sponsors
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Learn more about ForeVim platform, the developer, and how to support the project.
          </p>
        </div>
      </div>

      {/* ── Core Grid Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Platform Overview & Details */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Platform Glassmorphic Card */}
          <div className="glass-card p-6 space-y-6 relative overflow-hidden border border-border/80">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -z-10" />
            
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">ForeVim Observability</h2>
                <p className="text-xs text-muted-foreground">Version 1.0.0 · Platform Overview</p>
              </div>
            </div>

            <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
              <p>
                <strong>ForeVim</strong> is a state-of-the-art virtual machine observability and intelligent resource planning platform. 
                Designed to bridge the gap between traditional monitoring and proactive infrastructure management, ForeVim enables 
                operators to forecast resource exhaustion, analyze usage patterns, and optimize server sizes automatically.
              </p>
              <p>
                By scraping data directly from <strong>Prometheus Sources</strong>, ForeVim employs advanced time-series analysis 
                including Triple Exponential Smoothing (Holt-Winters), Moving Averages, and ARIMA algorithms to project 
                future CPU, Memory, and Disk utilization with 95% confidence intervals.
              </p>
            </div>

            {/* Core Features list with custom icons */}
            <div className="pt-4 border-t border-border/40 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">✨ AI Resource Analyzer</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Automated sizing recommendations rounded to nearest 2GB.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">SARIMA & HW Forecasts</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">High-fidelity predictive models evaluating up to 30 days of data.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                  <Server className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Multi-Source Prometheus</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Seamless synchronization across isolated clusters and endpoints.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
                  <Terminal className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Reactive Notifications</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Instant alerts dispatched via Telegram, Email SMTP, and SNMP Traps.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Developer Card (Ali Purnama) */}
          <div className="glass-card p-6 space-y-6 border border-border/80">
            <div>
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Terminal className="w-4 h-4 text-primary" />
                Meet the Developer
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">The mind behind ForeVim architecture and UI styling</p>
            </div>

            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
              {/* Profile Image */}
              <div className="w-16 h-16 rounded-2xl overflow-hidden border border-border/80 shadow-lg shrink-0 select-none">
                <img 
                  src="/ali-purnama.jpg" 
                  alt="Ali Purnama" 
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex-1 space-y-3 text-center sm:text-left">
                <div>
                  <h4 className="text-base font-bold text-foreground">Ali Purnama</h4>
                  <p className="text-xs text-primary font-medium mt-0.5">Tech Enthusiast</p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Ali is a tech enthusiast dedicated to creating high-performance DevOps, cloud infrastructure, and 
                  systems monitoring tools. Bringing modern user experiences and elegant aesthetics into enterprise software.
                </p>

                {/* Contact links */}
                <div className="pt-2 flex flex-wrap justify-center sm:justify-start gap-2.5">
                  <a
                    href="https://alipurnama.my.id"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-xs text-foreground font-medium transition-all"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    alipurnama.my.id
                    <ExternalLink className="w-3 h-3 opacity-50" />
                  </a>

                  <a
                    href="https://github.com/alianama/forevim"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-xs text-foreground font-medium transition-all"
                  >
                    <Github className="w-3.5 h-3.5" />
                    GitHub Repo
                    <ExternalLink className="w-3 h-3 opacity-50" />
                  </a>

                  <a
                    href="mailto:alipurnama69@gmail.com"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-xs text-foreground font-medium transition-all"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    alipurnama69@gmail.com
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Sponsors CTA Card */}
        <div className="space-y-6">
          <div className="glass-card p-6 border border-border/80 relative overflow-hidden flex flex-col justify-between h-full min-h-[380px]">
            {/* Top decorative gradient glow */}
            <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-rose-500 to-transparent" />
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl -z-10" />

            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                  <Heart className="w-5 h-5 fill-current animate-heartbeat" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-sm">Become a Sponsor</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Support open-source development</p>
                </div>
              </div>

              <div className="space-y-3.5 text-xs text-muted-foreground leading-relaxed">
                <p>
                  ForeVim is fully free and open-source software. To help sustain active updates, feature development, 
                  and bug fixes, consider buying me a coffee or becoming a sponsor.
                </p>
                <p>
                  Your sponsorship directly empowers:
                </p>
                <ul className="space-y-2 pl-1">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                    Adding new prediction algorithms
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                    Support for more metric databases (InfluxDB, OpenTSDB)
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                    Deep API optimizations and real-time dashboard enhancements
                  </li>
                </ul>
              </div>
            </div>

            {/* Support Methods */}
            <div className="pt-6 border-t border-border/40 mt-8 space-y-6">
              
              {/* International Support (Ko-fi) */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  <span>Global / International</span>
                  <span className="text-[10px] lowercase font-normal opacity-60">USD / Paypal / Card</span>
                </div>
                <a
                  href="https://ko-fi.com/alipurnama"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white font-bold text-xs rounded-xl shadow-md shadow-rose-500/10 active:scale-[0.98] transition-all"
                >
                  <Coffee className="w-3.5 h-3.5 fill-white animate-bounce" />
                  Support on Ko-fi (Global)
                  <ExternalLink className="w-3 h-3 opacity-80" />
                </a>
              </div>

              {/* Indonesia Local Support (Trakteer) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  <span>Lokal Indonesia</span>
                  <span className="text-[10px] lowercase font-normal opacity-60">IDR / QRIS / E-Wallet</span>
                </div>
                
                <div className="flex flex-col gap-2">
                  <a
                    href="https://trakteer.id/alipurnama"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-700 hover:to-rose-600 text-white font-bold text-xs rounded-xl shadow-md active:scale-[0.98] transition-all"
                  >
                    Trakteer Full Page
                    <ExternalLink className="w-3 h-3 opacity-80" />
                  </a>

                  <div className="grid grid-cols-2 gap-2">
                    <a
                      href="https://trakteer.id/alipurnama/gift"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 py-2 px-3 bg-secondary hover:bg-secondary/80 border border-border text-xs text-foreground font-semibold rounded-lg active:scale-[0.98] transition-all"
                    >
                      Gift Page
                      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                    </a>

                    <a
                      href="https://trakteer.id/alipurnama/tip"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 py-2 px-3 bg-secondary hover:bg-secondary/80 border border-border text-xs text-foreground font-semibold rounded-lg active:scale-[0.98] transition-all"
                    >
                      Simple Page
                      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                    </a>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
