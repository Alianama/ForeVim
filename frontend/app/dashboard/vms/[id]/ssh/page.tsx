"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useVM } from "@/hooks/useQueries";
import { TerminalIcon } from "@animateicons/react/lucide";
import { ArrowLeft, ShieldAlert, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SSHTab {
  id: string;
  title: string;
  username: string;
  port: string;
  otp: string;
  connected: boolean;
  connecting: boolean;
  connectionLogs: string[];
  fingerprintRequest: {
    fingerprint: string;
    algorithm: string;
    host: string;
    port: number;
  } | null;
}

export default function SSHPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: vm, isLoading } = useVM(id);

  const [tabs, setTabs] = useState<SSHTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  const [trustedFingerprints, setTrustedFingerprints] = useState<string[]>([]);

  // Refs for tracking passwords, websockets, terminals, and fit addons per tab
  const passwordsRef = useRef<{ [tabId: string]: string }>({});
  const socketsRef = useRef<{ [tabId: string]: WebSocket | null }>({});
  const terminalsRef = useRef<{ [tabId: string]: Terminal | null }>({});
  const fitAddonsRef = useRef<{ [tabId: string]: FitAddon | null }>({});

  // Load trusted fingerprints once on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("forevim-ssh-trusted-fingerprints");
      if (saved) {
        setTrustedFingerprints(JSON.parse(saved));
      }
    } catch (err) {
      console.error("Failed to load trusted fingerprints:", err);
    }
  }, []);

  // Initialize the first tab when VM is loaded
  useEffect(() => {
    if (vm) {
      let initialPort = "22";
      try {
        const savedPorts = localStorage.getItem("forevim-ssh-ports");
        if (savedPorts) {
          const parsed = JSON.parse(savedPorts);
          const savedPort = parsed[vm.ip_address];
          if (savedPort) {
            initialPort = savedPort.toString();
          }
        }
      } catch (err) {
        console.error("Failed to load SSH port:", err);
      }

      setTabs(prev => {
        if (prev.length === 0) {
          const firstTabId = Math.random().toString(36).substring(7);
          setActiveTabId(firstTabId);
          return [{
            id: firstTabId,
            title: vm.hostname,
            username: "root",
            port: initialPort,
            otp: "",
            connected: false,
            connecting: false,
            connectionLogs: [],
            fingerprintRequest: null
          }];
        }
        return prev;
      });
    }
  }, [vm]);

  // Handle window resizing and active tab transitions
  useEffect(() => {
    const handleWindowResize = () => {
      if (activeTabId && fitAddonsRef.current[activeTabId]) {
        try {
          fitAddonsRef.current[activeTabId]?.fit();
          const dims = fitAddonsRef.current[activeTabId]?.proposeDimensions();
          const ws = socketsRef.current[activeTabId];
          if (dims && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));
          }
        } catch (err) {
          console.error("Resize fit failed:", err);
        }
      }
    };

    window.addEventListener("resize", handleWindowResize);
    // Trigger fitting on tab switch after DOM displays the active pane
    const timer = setTimeout(handleWindowResize, 50);

    return () => {
      window.removeEventListener("resize", handleWindowResize);
      clearTimeout(timer);
    };
  }, [activeTabId]);

  // Clean up all connections and terminals on unmount
  useEffect(() => {
    return () => {
      Object.keys(socketsRef.current).forEach(tabId => {
        socketsRef.current[tabId]?.close();
      });
      Object.keys(terminalsRef.current).forEach(tabId => {
        terminalsRef.current[tabId]?.dispose();
      });
    };
  }, []);

  const handleAddTab = () => {
    if (!vm) return;
    
    let initialPort = "22";
    try {
      const savedPorts = localStorage.getItem("forevim-ssh-ports");
      if (savedPorts) {
        const parsed = JSON.parse(savedPorts);
        const savedPort = parsed[vm.ip_address];
        if (savedPort) {
          initialPort = savedPort.toString();
        }
      }
    } catch (err) {}

    const newTabId = Math.random().toString(36).substring(7);
    const newTabNumber = tabs.length + 1;
    
    setTabs(prev => [
      ...prev,
      {
        id: newTabId,
        title: `${vm.hostname} (${newTabNumber})`,
        username: "root",
        port: initialPort,
        otp: "",
        connected: false,
        connecting: false,
        connectionLogs: [],
        fingerprintRequest: null
      }
    ]);
    setActiveTabId(newTabId);
  };

  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (socketsRef.current[tabId]) {
      socketsRef.current[tabId]?.close();
      delete socketsRef.current[tabId];
    }
    if (terminalsRef.current[tabId]) {
      terminalsRef.current[tabId]?.dispose();
      delete terminalsRef.current[tabId];
    }
    if (fitAddonsRef.current[tabId]) {
      delete fitAddonsRef.current[tabId];
    }
    if (passwordsRef.current[tabId]) {
      delete passwordsRef.current[tabId];
    }

    setTabs(prev => {
      const filtered = prev.filter(t => t.id !== tabId);
      
      if (activeTabId === tabId && filtered.length > 0) {
        const closedIdx = prev.findIndex(t => t.id === tabId);
        const newActiveIdx = Math.max(0, closedIdx - 1);
        setActiveTabId(filtered[newActiveIdx].id);
      } else if (filtered.length === 0 && vm) {
        const fallbackId = Math.random().toString(36).substring(7);
        setActiveTabId(fallbackId);
        return [{
          id: fallbackId,
          title: vm.hostname,
          username: "root",
          port: "22",
          otp: "",
          connected: false,
          connecting: false,
          connectionLogs: [],
          fingerprintRequest: null
        }];
      }
      return filtered;
    });
  };

  const handleConnect = (tabId: string, e?: React.FormEvent, bypassFingerprintList?: string[]) => {
    if (e) e.preventDefault();
    const tab = tabs.find(t => t.id === tabId);
    if (!tab || !vm) return;

    setTabs(prev => prev.map(t => t.id === tabId ? {
      ...t,
      connecting: true,
      connectionLogs: [],
      fingerprintRequest: null
    } : t));

    if (vm.ip_address && tab.port) {
      try {
        const savedPorts = localStorage.getItem("forevim-ssh-ports");
        const parsed = savedPorts ? JSON.parse(savedPorts) : {};
        parsed[vm.ip_address] = parseInt(tab.port, 10) || 22;
        localStorage.setItem("forevim-ssh-ports", JSON.stringify(parsed));
      } catch (err) {
        console.error("Failed to save SSH port:", err);
      }
    }

    const storage = localStorage.getItem("forevim-auth");
    const token = storage ? JSON.parse(storage).state?.accessToken : null;

    const wsBase = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
    const wsUrl = `${wsBase}/api/v1/ssh/${id}?token=${token}`;
    const ws = new WebSocket(wsUrl);
    socketsRef.current[tabId] = ws;

    ws.onopen = () => {
      const fingerprintsToSend = bypassFingerprintList || trustedFingerprints;
      ws.send(JSON.stringify({
        username: tab.username,
        password: passwordsRef.current[tabId] || "",
        otp: tab.otp,
        port: parseInt(tab.port, 10) || 22,
        trusted_fingerprints: fingerprintsToSend
      }));
    };

    let termInstance: Terminal | null = null;
    let fitAddonInstance: FitAddon | null = null;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === "progress") {
          setTabs(prev => prev.map(t => t.id === tabId ? {
            ...t,
            connectionLogs: [...t.connectionLogs, data.message]
          } : t));
        } else if (data.status === "fingerprint_required") {
          setTabs(prev => prev.map(t => t.id === tabId ? {
            ...t,
            fingerprintRequest: {
              fingerprint: data.fingerprint,
              algorithm: data.algorithm,
              host: data.host,
              port: data.port
            },
            connecting: false
          } : t));
          ws.close();
        } else if (data.status === "failed") {
          setTabs(prev => prev.map(t => t.id === tabId ? {
            ...t,
            connectionLogs: [...t.connectionLogs, `❌ ${data.message}`],
            connecting: false
          } : t));
          ws.close();
        } else if (data.status === "connected") {
          setTabs(prev => prev.map(t => t.id === tabId ? {
            ...t,
            connected: true,
            connecting: false
          } : t));

          setTimeout(() => {
            const container = document.getElementById(`terminal-${tabId}`);
            if (container) {
              termInstance = new Terminal({
                cursorBlink: true,
                theme: {
                  background: "#000000",
                  foreground: "#f5f5f5",
                  cursor: "#ffffff"
                }
              });
              fitAddonInstance = new FitAddon();
              termInstance.loadAddon(fitAddonInstance);
              termInstance.open(container);
              fitAddonInstance.fit();

              termInstance.onData((input: string) => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(input);
                }
              });

              termInstance.onResize((size: { cols: number; rows: number }) => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: "resize", cols: size.cols, rows: size.rows }));
                }
              });

              const dims = fitAddonInstance.proposeDimensions();
              if (dims && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));
              }

              terminalsRef.current[tabId] = termInstance;
              fitAddonsRef.current[tabId] = fitAddonInstance;
            }
          }, 100);
        }
      } catch (err) {
        if (terminalsRef.current[tabId]) {
          terminalsRef.current[tabId]?.write(event.data);
        }
      }
    };

    ws.onclose = () => {
      setTabs(prev => prev.map(t => t.id === tabId ? {
        ...t,
        connected: false,
        connecting: false
      } : t));
      
      if (terminalsRef.current[tabId]) {
        terminalsRef.current[tabId]?.dispose();
        delete terminalsRef.current[tabId];
      }
      if (fitAddonsRef.current[tabId]) {
        delete fitAddonsRef.current[tabId];
      }
    };
  };

  const handleTrustAndConnect = (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab || !tab.fingerprintRequest) return;
    
    const newFingerprint = tab.fingerprintRequest.fingerprint;
    const updatedList = [...trustedFingerprints, newFingerprint];
    setTrustedFingerprints(updatedList);
    
    try {
      localStorage.setItem("forevim-ssh-trusted-fingerprints", JSON.stringify(updatedList));
    } catch (err) {
      console.error("Failed to save trusted fingerprints:", err);
    }
    
    setTabs(prev => prev.map(t => t.id === tabId ? {
      ...t,
      fingerprintRequest: null
    } : t));
    
    handleConnect(tabId, undefined, updatedList);
  };

  const handleFieldChange = (tabId: string, field: "username" | "port" | "otp", value: string) => {
    setTabs(prev => prev.map(t => t.id === tabId ? {
      ...t,
      [field]: value
    } : t));
  };

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading VM details...</div>;
  if (!vm) return <div className="p-8 text-sm text-muted-foreground">VM not found</div>;

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-6rem)] animate-fade-in">
      {/* Header section */}
      <div className="flex items-center gap-4 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/dashboard/vms/${vm.id}`)}
          className="shrink-0"
        >
          <ArrowLeft size={16} />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TerminalIcon size={24} className="text-foreground animate-pulse-slow" />
            SSH Workspace: {vm.hostname}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">{vm.ip_address}</p>
        </div>
      </div>

      {/* Tabs Container */}
      <div className="flex items-center gap-1.5 border-b border-border bg-card/20 px-3 py-2 rounded-t-lg overflow-x-auto shrink-0 select-none">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={cn(
                "group relative flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all duration-200 border border-transparent select-none",
                {
                  "bg-background text-foreground border-border shadow-sm": isActive,
                  "text-muted-foreground hover:bg-secondary/40 hover:text-foreground": !isActive
                }
              )}
            >
              {/* Pulsing indicator */}
              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0 transition-all", {
                "bg-green-500 animate-pulse": tab.connected,
                "bg-amber-500 animate-pulse": tab.connecting,
                "bg-muted-foreground/30": !tab.connected && !tab.connecting
              })} />
              
              <span className="truncate max-w-[130px]">{tab.title}</span>
              
              {/* Close Tab Button */}
              <button
                onClick={(e) => handleCloseTab(tab.id, e)}
                className="opacity-0 group-hover:opacity-100 hover:bg-secondary rounded p-0.5 transition-all text-muted-foreground hover:text-foreground shrink-0"
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
        
        {/* New Tab Spawner */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleAddTab}
          className="w-7 h-7 hover:bg-secondary rounded-md text-muted-foreground hover:text-foreground shrink-0"
        >
          <Plus size={14} />
        </Button>
      </div>

      {/* Connection & Terminal Workspace */}
      <div className="flex-1 flex flex-col min-h-0">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          
          return (
            <div
              key={tab.id}
              className={cn("flex-1 flex flex-col min-h-0", {
                "block": isActive,
                "hidden": !isActive
              })}
            >
              {!tab.connected ? (
                <div className="w-full flex-1 flex flex-col items-center justify-center p-4">
                  {/* Fingerprint Modal */}
                  {tab.fingerprintRequest && (
                    <div className="glass-card p-6 max-w-md w-full border border-border/80 shadow-md space-y-6 animate-fade-in">
                      <div className="flex items-center gap-3 border-b border-border pb-4">
                        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center border border-border text-foreground">
                          <ShieldAlert size={20} />
                        </div>
                        <div>
                          <h2 className="text-base font-bold text-foreground">Verify Host Identity</h2>
                          <p className="text-xs text-muted-foreground">The authenticity of this host cannot be established.</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Host Address</span>
                          <div className="bg-secondary px-3 py-1.5 rounded text-xs font-mono text-foreground border border-border/40">
                            {tab.fingerprintRequest.host}:{tab.fingerprintRequest.port}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Key Algorithm</span>
                          <div className="bg-secondary px-3 py-1.5 rounded text-xs font-mono text-foreground border border-border/40">
                            {tab.fingerprintRequest.algorithm}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Key Fingerprint</span>
                          <div className="bg-secondary px-3 py-2 rounded text-xs font-mono text-foreground border border-border/40 break-all select-all leading-relaxed">
                            {tab.fingerprintRequest.fingerprint}
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Are you sure you want to trust this key and connect? If you trust this key, it will be saved to your local trusted hosts list.
                        </p>
                      </div>

                      <div className="flex items-center gap-3 border-t border-border pt-4">
                        <Button
                          onClick={() => handleTrustAndConnect(tab.id)}
                          className="flex-1 font-semibold text-xs"
                        >
                          Trust & Connect
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setTabs(prev => prev.map(t => t.id === tab.id ? { ...t, fingerprintRequest: null } : t));
                          }}
                          className="flex-1 font-semibold text-xs"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Connecting live status */}
                  {tab.connecting && !tab.fingerprintRequest && (
                    <div className="glass-card p-6 max-w-md w-full border border-border/80 shadow-md space-y-4 animate-fade-in">
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 border-2 border-foreground border-t-transparent rounded-full animate-spin shrink-0" />
                        <span className="font-semibold text-sm text-foreground">Establishing Secure Connection...</span>
                      </div>
                      <div className="bg-black/90 rounded-md p-4 font-mono text-xs text-muted-foreground border border-border space-y-1.5 max-h-48 overflow-y-auto">
                        {tab.connectionLogs.map((log, idx) => (
                          <div key={idx} className="leading-relaxed whitespace-pre-wrap animate-fade-in text-foreground/80">
                            {log}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Connect form */}
                  {!tab.connecting && !tab.fingerprintRequest && (
                    <div className="glass-card p-6 max-w-md w-full border border-border/80 shadow-md animate-fade-in">
                      <form onSubmit={(e) => handleConnect(tab.id, e)} className="space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                          <div className="col-span-2">
                            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Username</label>
                            <input
                              type="text"
                              value={tab.username}
                              onChange={(e) => handleFieldChange(tab.id, "username", e.target.value)}
                              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                              required
                              autoComplete="username"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Port</label>
                            <input
                              type="number"
                              value={tab.port}
                              onChange={(e) => handleFieldChange(tab.id, "port", e.target.value)}
                              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                              required
                              min="1"
                              max="65535"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Password</label>
                          <input
                            type="password"
                            name="password"
                            defaultValue={passwordsRef.current[tab.id] || ""}
                            onChange={(e) => { passwordsRef.current[tab.id] = e.target.value; }}
                            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                            autoComplete="current-password"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">2FA / OTP (Optional)</label>
                          <input
                            type="text"
                            value={tab.otp}
                            onChange={(e) => handleFieldChange(tab.id, "otp", e.target.value)}
                            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                            autoComplete="one-time-code"
                          />
                        </div>
                        <Button
                          type="submit"
                          disabled={tab.connecting}
                          className="w-full font-semibold"
                        >
                          Connect SSH
                        </Button>
                      </form>
                    </div>
                  )}
                </div>
              ) : (
                /* Terminal frame */
                <div className="flex-1 glass-card p-2 bg-black border border-border/80 min-h-0 flex flex-col">
                  <div id={`terminal-${tab.id}`} className="flex-1 h-full w-full min-h-0 overflow-hidden" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
