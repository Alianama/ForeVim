"use client";

import { useState } from "react";
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
  Info,
  ChevronRight,
  Smartphone
} from "lucide-react";

type TabId = "sponsors" | "platform" | "developer";

const TABS: { id: TabId; label: string; icon: React.ReactNode; desc: string }[] = [
  {
    id: "sponsors",
    label: "Support & Sponsors",
    icon: <Heart className="w-4 h-4" />,
    desc: "Ko-fi & Trakteer live checkout",
  },
  {
    id: "platform",
    label: "Platform Info",
    icon: <Sparkles className="w-4 h-4" />,
    desc: "ForeVim architecture & core features",
  },
  {
    id: "developer",
    label: "The Developer",
    icon: <Terminal className="w-4 h-4" />,
    desc: "Ali Purnama - Tech Enthusiast",
  },
];

export default function AboutPage() {
  const [activeTab, setActiveTab] = useState<TabId>("sponsors");

  return (
    <div className="space-y-6 max-w-6xl animate-fade-in pb-4">
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

      {/* ── Unified Tabbed Glass Card (Single Page - No Scroll) ── */}
      <div className="flex flex-col md:flex-row gap-6 min-h-[500px]">
        
        {/* Sidebar tabs (Left) */}
        <div className="w-full md:w-64 shrink-0 flex flex-col gap-2">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-start gap-3 px-4 py-3.5 rounded-xl text-left transition-all border group ${
                  isActive
                    ? "bg-primary/10 text-primary border-primary/20 shadow-sm"
                    : "text-muted-foreground bg-card hover:bg-secondary hover:text-foreground border-transparent"
                }`}
              >
                <span className={`mt-0.5 shrink-0 transition-transform group-hover:scale-110 ${isActive ? "text-primary" : "text-muted-foreground/60"}`}>
                  {tab.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold block">{tab.label}</span>
                  <span className="text-[10px] text-muted-foreground leading-tight block mt-0.5 truncate">
                    {tab.desc}
                  </span>
                </div>
                <ChevronRight
                  className={`w-3.5 h-3.5 shrink-0 mt-1 transition-transform ${
                    isActive ? "text-primary translate-x-0.5" : "text-muted-foreground/30 group-hover:translate-x-0.5"
                  }`}
                />
              </button>
            );
          })}
        </div>

        {/* Content panel (Right) */}
        <div className="flex-1 glass-card p-6 flex flex-col justify-between min-h-[460px] relative overflow-hidden">
          
          {/* Subtle brand background glows */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl -z-10" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-primary/5 rounded-full blur-3xl -z-10" />

          {/* ── 1. SPONSORS TAB (Default & Top Priority) ── */}
          {activeTab === "sponsors" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch h-full animate-fade-in">
              
              {/* Left Column: Descriptions & Direct Buttons */}
              <div className="lg:col-span-6 flex flex-col justify-between space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                      <Heart className="w-5 h-5 fill-current animate-heartbeat" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-foreground">Become a Sponsor</h2>
                      <p className="text-[10px] text-muted-foreground">Support free open-source development</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground leading-relaxed font-semibold text-foreground">
                      ForeVim is completely free and open-source. Your support directly funds:
                    </p>
                    <ul className="text-[11px] text-muted-foreground space-y-2 pl-1">
                      <li className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 mt-1" />
                        <span><strong>Core Platform Updates</strong>: Maintaining packages, patch upgrades, and security fixes.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 mt-1" />
                        <span><strong>AI Predictor Engines</strong>: LSTM deep-learning forecasting models research and execution.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 mt-1" />
                        <span><strong>Multi-DB Scrapers</strong>: Supporting scraper scaling for InfluxDB, OpenTSDB, and custom JSON targets.</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Gateway Action Buttons Column */}
                <div className="space-y-3 pt-4 border-t border-border/40">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                    Direct Support Gateways:
                  </div>
                  
                  {/* Ko-fi Button */}
                  <a
                    href="https://ko-fi.com/alipurnama"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3.5 rounded-xl bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/20 text-xs font-semibold text-amber-600 dark:text-amber-400 transition-all group shadow-sm hover:shadow"
                  >
                    <span className="flex items-center gap-2.5">
                      <Coffee className="w-4 h-4 text-amber-500 fill-current animate-bounce" />
                      Support Us via Ko-fi (Global Checkout)
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground group-hover:text-amber-500 transition-colors">
                      Open Page
                      <ExternalLink className="w-3 h-3" />
                    </span>
                  </a>

                  {/* Trakteer Button */}
                  <a
                    href="https://trakteer.id/alipurnama/tip"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3.5 rounded-xl bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/20 text-xs font-semibold text-rose-600 dark:text-rose-400 transition-all group shadow-sm hover:shadow"
                  >
                    <span className="flex items-center gap-2.5">
                      <Heart className="w-4 h-4 text-rose-500 fill-current animate-pulse" />
                      Support Us via Trakteer (Indonesia Lokal)
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground group-hover:text-rose-500 transition-colors">
                      Open Page
                      <ExternalLink className="w-3 h-3" />
                    </span>
                  </a>
                </div>
              </div>

              {/* Right Column: Single iPhone Mockup Rendering Ko-fi directly with embed parameters to bypass frame locks */}
              <div className="lg:col-span-6 flex flex-col items-center justify-center min-h-[380px] space-y-3">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider select-none">
                  📱 Ko-fi Live Donation
                </div>
                
                {/* Realistically Styled iPhone Mockup */}
                <div className="relative border-zinc-800 dark:border-zinc-800 bg-zinc-800 border-[10px] rounded-[2rem] h-[400px] w-[210px] shadow-2xl overflow-hidden flex flex-col shrink-0">
                  
                  {/* Dynamic Island Notch */}
                  <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-16 h-3 bg-zinc-900 rounded-full z-20 flex items-center justify-center">
                    <div className="w-1 h-1 rounded-full bg-zinc-700/80 mr-6" />
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-900/60" />
                  </div>

                  {/* Status Bar */}
                  <div className="absolute top-0.5 left-0 right-0 px-4 flex items-center justify-between text-[7.5px] font-medium text-zinc-400 z-20 select-none">
                    <span>09:41</span>
                    <div className="flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-amber-500 animate-ping" />
                      <span>5G</span>
                    </div>
                  </div>

                  {/* Iframe displaying Ko-fi widget URL directly with virtual zoom-out */}
                  <div className="w-full h-full bg-card relative z-10 pt-5 overflow-hidden">
                    <div className="w-full h-full relative overflow-hidden">
                      <iframe 
                        src="https://ko-fi.com/alipurnama/?hidefeed=true&widget=true&embed=true&preview=true"
                        title="Ko-fi Live Support Gateway"
                        className="absolute top-0 left-0 border-0 select-text origin-top-left"
                        style={{
                          width: "138%",
                          height: "138%",
                          transform: "scale(0.725)",
                        }}
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation"
                      />
                    </div>
                  </div>
                </div>

                {/* Subtitle link under iPhone */}
                <a
                  href="https://ko-fi.com/alipurnama"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-primary transition-colors pt-1"
                >
                  Click to open direct Ko-fi page
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>

            </div>
          )}

          {/* ── 2. PLATFORM TAB ── */}
          {activeTab === "platform" && (
            <div className="space-y-5 animate-fade-in flex flex-col justify-between h-full">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-foreground">ForeVim Observability</h2>
                    <p className="text-[10px] text-muted-foreground">Version 1.0.0 · Core Platform Overview</p>
                  </div>
                </div>

                <div className="space-y-3.5 text-xs text-muted-foreground leading-relaxed">
                  <p>
                    <strong>ForeVim</strong> (Forecasting Virtual Machine) is a state-of-the-art cloud monitoring and predictive infrastructure management tool. By scraping real-time metrics directly from <strong>Prometheus Sources</strong>, ForeVim bridges the gap between active telemetry and capacity planning.
                  </p>
                  <p>
                    Utilizing Holt-Winters, Moving Averages, and ARIMA algorithms, ForeVim projects CPU, Memory, and Disk utilization trends up to 30 days ahead with 95% confidence intervals, preventing resource exhaustion before it impacts your workloads.
                  </p>
                </div>
              </div>

              {/* Core Features Grid */}
              <div className="pt-4 border-t border-border/40 grid grid-cols-2 gap-4">
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                    <Cpu className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-foreground uppercase tracking-wider">AI Analyzer</h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Sizing recommendations rounded to nearest 2GB.</p>
                  </div>
                </div>

                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                    <Database className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-foreground uppercase tracking-wider">Forecasting</h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">HW & SARIMA evaluation with holdout MAPE checks.</p>
                  </div>
                </div>

                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                    <Server className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-foreground uppercase tracking-wider">Prometheus</h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Integrated multi-source scrape endpoints.</p>
                  </div>
                </div>

                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
                    <Heart className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-foreground uppercase tracking-wider">Alert Routing</h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Telegrams, Email SMTPs, and SNMP Trap dispatch.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── 3. DEVELOPER TAB ── */}
          {activeTab === "developer" && (
            <div className="space-y-4 animate-fade-in flex flex-col justify-between h-full">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Terminal className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-foreground">Meet the Developer</h2>
                    <p className="text-[10px] text-muted-foreground">The mind behind ForeVim architecture & design</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 py-1">
                  {/* Profile Image */}
                  <div className="w-14 h-14 rounded-xl overflow-hidden border border-border/80 shadow-md shrink-0 select-none">
                    <img 
                      src="/ali-purnama.jpg" 
                      alt="Ali Purnama" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Ali Purnama</h3>
                    <p className="text-xs text-primary font-medium mt-0.5">Tech Enthusiast</p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  Ali is a tech enthusiast dedicated to creating high-performance cloud monitoring, DevOps workflow automations, and beautiful systems observability tools. He focuses on introducing pixel-perfect aesthetics and highly interactive user interfaces into the enterprise software layer.
                </p>
              </div>

              {/* Developer Links */}
              <div className="pt-4 border-t border-border/40 flex flex-wrap gap-2.5">
                <a
                  href="https://alipurnama.my.id"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-xs text-foreground font-semibold transition-all"
                >
                  <Globe className="w-3.5 h-3.5" />
                  alipurnama.my.id
                  <ExternalLink className="w-3 h-3 opacity-50" />
                </a>

                <a
                  href="https://github.com/alianama/forevim"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-xs text-foreground font-semibold transition-all"
                >
                  <Github className="w-3.5 h-3.5" />
                  GitHub Repository
                  <ExternalLink className="w-3 h-3 opacity-50" />
                </a>

                <a
                  href="mailto:alipurnama69@gmail.com"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-xs text-foreground font-semibold transition-all"
                >
                  <Mail className="w-3.5 h-3.5" />
                  alipurnama69@gmail.com
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
