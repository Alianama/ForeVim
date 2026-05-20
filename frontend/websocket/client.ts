/**
 * WebSocket client abstraction with reconnect logic.
 */
import { WSMessage } from "@/types";

type Handler<T = unknown> = (data: T) => void;

export class ForeVimWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Map<string, Handler[]> = new Map();
  private reconnectDelay = 3000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(path: string) {
    const wsBase =
      process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("access_token")
        : null;
    this.url = `${wsBase}${path}${token ? `?token=${token}` : ""}`;
  }

  connect(): void {
    if (
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.info("[ForeVim WS] Connected to", this.url);
      this.reconnectDelay = 3000;
      this.pingInterval = setInterval(() => {
        this.ws?.send("ping");
      }, 30_000);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        const handlers = this.handlers.get(msg.event) ?? [];
        handlers.forEach((h) => h(msg.data));
        // also call wildcard handlers
        (this.handlers.get("*") ?? []).forEach((h) => h(msg));
      } catch {
        // ignore parse errors
      }
    };

    this.ws.onclose = () => {
      console.info("[ForeVim WS] Disconnected");
      if (this.pingInterval) clearInterval(this.pingInterval);
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 30_000);
          this.connect();
        }, this.reconnectDelay);
      }
    };

    this.ws.onerror = (err) => {
      console.error("[ForeVim WS] Error", err);
    };
  }

  on<T = unknown>(event: string, handler: Handler<T>): () => void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler as Handler);
    this.handlers.set(event, list);

    return () => {
      const updated = (this.handlers.get(event) ?? []).filter(
        (h) => h !== handler
      );
      this.handlers.set(event, updated as Handler[]);
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.ws?.close();
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton global WebSocket
let globalWs: ForeVimWebSocket | null = null;

export function getGlobalWS(): ForeVimWebSocket {
  if (!globalWs) {
    globalWs = new ForeVimWebSocket("/api/v1/ws");
  }
  return globalWs;
}
