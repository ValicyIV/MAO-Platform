// WebSocketService.ts — WebSocket connection lifecycle (Pattern 10)
// Singleton. Manages connection, reconnection, and event routing.
// Accessed outside React tree via getInstance().

import type { ServerMessage, ClientMessage } from "@mao/shared-types";
import { AGUIEventRouter } from "./AGUIEventRouter";

const WS_BASE = import.meta.env.VITE_WS_URL ?? "ws://localhost:8000";

// Reconnect backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
const BACKOFF_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];

export class WebSocketService {
  private static _instance: WebSocketService | null = null;

  private ws: WebSocket | null = null;
  private workflowId: string | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingTask: string | null = null;
  private router = new AGUIEventRouter();

  static getInstance(): WebSocketService {
    if (!WebSocketService._instance) {
      WebSocketService._instance = new WebSocketService();
    }
    return WebSocketService._instance;
  }

  connect(workflowId: string): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.workflowId === workflowId) return;
    this.workflowId = workflowId;
    this.reconnectAttempt = 0;
    this._open();
  }

  disconnect(): void {
    this._clearReconnectTimer();
    this.workflowId = null;
    this.pendingTask = null;
    if (this.ws) {
      this.ws.onclose = null; // prevent reconnect on intentional disconnect
      this.ws.close(1000, "client disconnect");
      this.ws = null;
    }
    this.router.destroy();
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn("[WS] Cannot send — not connected", msg.type);
    }
  }

  execute(task: string): void {
    if (!this.workflowId) {
      console.error("[WS] execute called without workflowId");
      return;
    }
    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.pendingTask = task;
      return;
    }
    this.send({ type: "execute", workflowId: this.workflowId, task });
  }

  private _open(): void {
    if (!this.workflowId) return;
    const url = `${WS_BASE}/ws/${this.workflowId}`;
    console.debug("[WS] connecting to", url);

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.debug("[WS] connected", this.workflowId);
      this.reconnectAttempt = 0;
      if (this.pendingTask && this.workflowId) {
        const task = this.pendingTask;
        this.pendingTask = null;
        this.send({ type: "execute", workflowId: this.workflowId, task });
      }
    };

    this.ws.onmessage = (event: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        this.router.route(msg);
      } catch (e) {
        console.error("[WS] parse error", e);
      }
    };

    this.ws.onerror = (err) => {
      console.error("[WS] error", err);
    };

    this.ws.onclose = (event) => {
      console.debug("[WS] closed", event.code, event.reason);
      if (event.code !== 1000) {
        this._scheduleReconnect();
      }
    };
  }

  private _scheduleReconnect(): void {
    if (!this.workflowId) return;
    const delay = BACKOFF_DELAYS[Math.min(this.reconnectAttempt, BACKOFF_DELAYS.length - 1)] ?? 30000;
    this.reconnectAttempt++;
    console.debug(`[WS] reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`);
    this.reconnectTimer = setTimeout(() => this._open(), delay);
  }

  private _clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
