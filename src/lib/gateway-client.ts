/**
 * WebSocket JSON-RPC client for the hermes-agent tui_gateway.
 *
 * Connects to the bridge server (bridge/server.py) which spawns and
 * manages the tui_gateway subprocess. All tui_gateway methods and
 * events are available through this client.
 */

import type {
  CommandDispatchResponse,
  CommandsCatalogResponse,
  CompletionResponse,
  ConfigSetResponse,
  DelegationStatusResponse,
  GatewayEvent,
  GatewayEventType,
  ModelOptionsResponse,
  PromptSubmitResponse,
  SessionBranchResponse,
  SessionCompressResponse,
  SessionCreateResponse,
  SessionListResponse,
  SessionResumeResponse,
  SessionUsageResponse,
  ShellExecResponse,
  ToolsConfigureResponse,
  VoiceToggleResponse,
} from "./gateway-types";

// ── Configuration ───────────────────────────────────────────────────

const DEFAULT_BRIDGE_URL = "ws://127.0.0.1:9120";
const REQUEST_TIMEOUT_MS = 120_000;
const RECONNECT_DELAY_MS = 2_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

// Derive bridge URL from current origin for external access
function getBridgeUrl(): string {
  // Check if running in browser
  if (typeof window !== "undefined" && window.location) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.hostname;
    const port = window.location.port || (protocol === "wss:" ? "443" : "80");
    // Use the same host as the page, but port 9120 for the bridge
    return `${protocol}//${host}:9120`;
  }
  return DEFAULT_BRIDGE_URL;
}

// ── Types ───────────────────────────────────────────────────────────

type EventCallback = (event: GatewayEvent) => void;

interface PendingRequest {
  id: string;
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

export interface ConnectionStatus {
  state: ConnectionState;
  error?: string;
  errorType?: "bridge_down" | "gateway_unreachable" | "network_error" | "unknown";
}

type ConnectionCallback = (status: ConnectionStatus) => void;

// ── Client ──────────────────────────────────────────────────────────

export class GatewayClient {
  private ws: WebSocket | null = null;
  private reqId = 0;
  private pending = new Map<string, PendingRequest>();
  private eventListeners = new Map<string, Set<EventCallback>>();
  private globalListeners = new Set<EventCallback>();
  private connectionListeners = new Set<ConnectionCallback>();
  private _status: ConnectionStatus = { state: "disconnected" };
  private readonly url: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = RECONNECT_DELAY_MS;
  private shouldReconnect = true;
  private lastGatewayError: string | null = null;
  private isConnecting = false;

  constructor(url?: string) {
    this.url = url || getBridgeUrl();
  }

  // ── Connection state ────────────────────────────────────────────

  get state(): ConnectionState {
    return this._status.state;
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  private setStatus(status: ConnectionStatus) {
    this._status = status;
    for (const cb of this.connectionListeners) {
      try {
        cb(status);
      } catch {
        // ignore listener errors
      }
    }
  }

  onConnection(cb: ConnectionCallback): () => void {
    this.connectionListeners.add(cb);
    // Call immediately with current status
    cb(this._status);
    return () => this.connectionListeners.delete(cb);
  }

  // ── Connect / disconnect ────────────────────────────────────────

  connect() {
    if (this.isConnecting) {
      console.log('[GatewayClient] connect() called but already connecting, ignoring');
      return;
    }
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      console.log('[GatewayClient] connect() called but already connected/connecting, ignoring');
      return;
    }

    console.log('[GatewayClient] connect() called, starting connection to', this.url);
    this.isConnecting = true;
    this.shouldReconnect = true;
    this.setStatus({ state: "connecting" });

    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      console.log('[GatewayClient] WebSocket opened');
      this.isConnecting = false;
      this.setStatus({ state: "connected" });
      this.reconnectDelay = RECONNECT_DELAY_MS;
      this.lastGatewayError = null;
    };

    ws.onmessage = (event) => {
      this.handleMessage(event.data as string);
    };

    ws.onclose = (event) => {
      console.log('[GatewayClient] WebSocket closed:', event.code, event.reason);
      this.isConnecting = false;
      this.rejectAllPending(new Error("WebSocket closed"));
      
      // Determine error type based on close code and last gateway error
      let errorType: ConnectionStatus["errorType"] = "unknown";
      let error: string | undefined;

      if (event.code === 1006) {
        errorType = "bridge_down";
        error = "Bridge server not reachable, check if bridge is running";
      } else if (event.code === 1000) {
        // Normal close
        errorType = "network_error";
        error = "Connection closed normally";
      }

      this.setStatus({ state: "disconnected", error, errorType });
      this.ws = null;
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };

    ws.onerror = () => {
      console.log('[GatewayClient] WebSocket error');
      this.isConnecting = false;
      this.setStatus({ 
        state: "error", 
        error: "Connection error, check network/firewall",
        errorType: "network_error"
      });
    };
  }

  disconnect() {
    this.shouldReconnect = false;
    this.isConnecting = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.rejectAllPending(new Error("Client disconnected"));
    this.setStatus({ state: "disconnected" });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, MAX_RECONNECT_DELAY_MS);
      this.connect();
    }, this.reconnectDelay);
  }

  // ── Message handling ────────────────────────────────────────────

  private handleMessage(raw: string) {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    // JSON-RPC response (has id)
    const id = msg.id as string | undefined;
    if (id && this.pending.has(id)) {
      const p = this.pending.get(id)!;
      clearTimeout(p.timeout);
      this.pending.delete(id);

      if (msg.error) {
        const err = msg.error as { message?: string };
        p.reject(new Error(err.message || "Request failed"));
      } else {
        p.resolve(msg.result);
      }
      return;
    }

    // JSON-RPC event notification
    if (msg.method === "event" && msg.params) {
      const event = msg.params as GatewayEvent;
      this.dispatchEvent(event);
    }
  }

  private dispatchEvent(event: GatewayEvent) {
    // Capture gateway errors for connection diagnostics
    if (event.type === "gateway.protocol_error" || event.type === "gateway.start_timeout") {
      this.lastGatewayError = (event.payload && 'preview' in event.payload && event.payload.preview) ? event.payload.preview : event.type;
    }

    // Type-specific listeners
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      for (const cb of listeners) {
        try {
          cb(event);
        } catch {
          // ignore
        }
      }
    }

    // Global listeners
    for (const cb of this.globalListeners) {
      try {
        cb(event);
      } catch {
        // ignore
      }
    }
  }

  // ── Event subscription ──────────────────────────────────────────

  on(eventType: GatewayEventType, cb: EventCallback): () => void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    this.eventListeners.get(eventType)!.add(cb);
    return () => this.eventListeners.get(eventType)?.delete(cb);
  }

  onAny(cb: EventCallback): () => void {
    this.globalListeners.add(cb);
    return () => this.globalListeners.delete(cb);
  }

  // ── JSON-RPC request ────────────────────────────────────────────

  request<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error("Not connected"));
      }

      const id = `r${++this.reqId}`;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout: ${method}`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, {
        id,
        method,
        resolve: (v) => resolve(v as T),
        reject,
        timeout,
      });

      const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
      this.ws.send(payload);
    });
  }

  private rejectAllPending(err: Error) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timeout);
      p.reject(err);
    }
    this.pending.clear();
  }

  // ── Typed convenience methods ───────────────────────────────────
  // These mirror the full tui_gateway @method catalog.

  // Session lifecycle
  sessionCreate(params: { cwd?: string; model?: string; provider?: string } = {}) {
    return this.request<SessionCreateResponse>("session.create", params);
  }

  sessionList(params: { limit?: number } = {}) {
    return this.request<SessionListResponse>("session.list", params);
  }

  sessionResume(params: { session_id: string }) {
    return this.request<SessionResumeResponse>("session.resume", params);
  }

  sessionClose(params: { session_id: string }) {
    return this.request<{ ok?: boolean }>("session.close", params);
  }

  sessionDelete(params: { session_id: string }) {
    return this.request<{ deleted?: boolean; session_id?: string }>("session.delete", params);
  }

  sessionRename(params: { session_id: string; title: string }) {
    return this.request<{ renamed?: boolean; title?: string }>("session.rename", params);
  }

  sessionBranch(params: { session_id: string }) {
    return this.request<SessionBranchResponse>("session.branch", params);
  }

  sessionUndo(params: { session_id: string; count?: number }) {
    return this.request<{ removed?: number }>("session.undo", params);
  }

  sessionCompress(params: { session_id: string }) {
    return this.request<SessionCompressResponse>("session.compress", params);
  }

  sessionUsage(params: { session_id: string }) {
    return this.request<SessionUsageResponse>("session.usage", params);
  }

  sessionHistory(params: { session_id: string }) {
    return this.request<{ messages: Array<{ role: string; text?: string }> }>("session.history", params);
  }

  sessionInterrupt(params: { session_id: string }) {
    return this.request<{ ok?: boolean }>("session.interrupt", params);
  }

  sessionSteer(params: { session_id: string; text: string }) {
    return this.request<{ status?: string; text?: string }>("session.steer", params);
  }

  // Prompt submission
  promptSubmit(params: { session_id: string; text: string; images?: string[] }) {
    return this.request<PromptSubmitResponse>("prompt.submit", params);
  }

  promptBackground(params: { session_id: string; text: string }) {
    return this.request<{ task_id?: string }>("prompt.background", params);
  }

  promptBtw(params: { session_id: string; text: string }) {
    return this.request<{ ok?: boolean }>("prompt.btw", params);
  }

  // Interactive flows
  clarifyRespond(params: { session_id: string; request_id: string; answer: string }) {
    return this.request<{ ok?: boolean }>("clarify.respond", params);
  }

  approvalRespond(params: { session_id: string; approved: boolean }) {
    return this.request<{ ok?: boolean }>("approval.respond", params);
  }

  sudoRespond(params: { session_id: string; request_id: string; password: string }) {
    return this.request<{ ok?: boolean }>("sudo.respond", params);
  }

  secretRespond(params: { session_id: string; request_id: string; value: string }) {
    return this.request<{ ok?: boolean }>("secret.respond", params);
  }

  // Slash commands
  commandsCatalog(params: { session_id: string }) {
    return this.request<CommandsCatalogResponse>("commands.catalog", params);
  }

  commandDispatch(params: { session_id: string; name: string; arg?: string }) {
    return this.request<CommandDispatchResponse>("command.dispatch", params);
  }

  slashExec(params: { session_id: string; command: string; args?: string }) {
    return this.request<{ output?: string; warning?: string }>("slash.exec", params);
  }

  completeSlash(params: { session_id: string; text: string; cursor?: number }) {
    return this.request<CompletionResponse>("complete.slash", params);
  }

  completePath(params: { session_id: string; text: string; cursor?: number }) {
    return this.request<CompletionResponse>("complete.path", params);
  }

  // Config
  configSet(params: { session_id: string; key: string; value: string }) {
    return this.request<ConfigSetResponse>("config.set", params);
  }

  configGet(params: { key: string }) {
    return this.request<{ display?: string; home?: string; value?: string }>("config.get", params);
  }

  configShow(params: { session_id: string }) {
    return this.request<Record<string, unknown>>("config.show", params);
  }

  // Model
  modelOptions(params: { session_id: string }) {
    return this.request<ModelOptionsResponse>("model.options", params);
  }

  // Tools & skills
  toolsList(params: { session_id: string }) {
    return this.request<Record<string, unknown>>("tools.list", params);
  }

  toolsShow(params: { session_id: string; name: string }) {
    return this.request<Record<string, unknown>>("tools.show", params);
  }

  toolsConfigure(params: { session_id: string; enable?: string[]; disable?: string[] }) {
    return this.request<ToolsConfigureResponse>("tools.configure", params);
  }

  toolsEnable(params: { session_id: string; name: string }) {
    return this.request<Record<string, unknown>>("tools.enable", params);
  }

  toolsDisable(params: { session_id: string; name: string }) {
    return this.request<Record<string, unknown>>("tools.disable", params);
  }

  toolsetsList(params: { session_id: string }) {
    return this.request<Record<string, unknown>>("toolsets.list", params);
  }

  skillsManage(params: { session_id: string; action?: string; name?: string; query?: string }) {
    return this.request<Record<string, unknown>>("skills.manage", params);
  }

  // Delegation / subagents
  delegationStatus(params: { session_id: string }) {
    return this.request<DelegationStatusResponse>("delegation.status", params);
  }

  delegationPause(params: { session_id: string; paused: boolean }) {
    return this.request<{ paused?: boolean }>("delegation.pause", params);
  }

  subagentInterrupt(params: { session_id: string; subagent_id: string }) {
    return this.request<{ found?: boolean; subagent_id?: string }>("subagent.interrupt", params);
  }

  // Shell
  shellExec(params: { session_id: string; command: string }) {
    return this.request<ShellExecResponse>("shell.exec", params);
  }

  // Clipboard / images
  clipboardPaste(params: { session_id: string }) {
    return this.request<Record<string, unknown>>("clipboard.paste", params);
  }

  imageAttach(params: { session_id: string; path?: string; base64?: string; mime?: string }) {
    return this.request<Record<string, unknown>>("image.attach", params);
  }

  // Voice
  voiceToggle(params: { session_id: string }) {
    return this.request<VoiceToggleResponse>("voice.toggle", params);
  }

  voiceRecord(params: { session_id: string }) {
    return this.request<{ status?: string; text?: string }>("voice.record", params);
  }

  // Rollback
  rollbackList(params: { session_id: string }) {
    return this.request<Record<string, unknown>>("rollback.list", params);
  }

  rollbackRestore(params: { session_id: string; index: number }) {
    return this.request<Record<string, unknown>>("rollback.restore", params);
  }

  rollbackDiff(params: { session_id: string; index: number }) {
    return this.request<Record<string, unknown>>("rollback.diff", params);
  }

  // Browser
  browserManage(params: { session_id: string; action: string }) {
    return this.request<Record<string, unknown>>("browser.manage", params);
  }

  // Cron
  cronManage(params: { session_id: string; action?: string }) {
    return this.request<Record<string, unknown>>("cron.manage", params);
  }

  // Terminal resize
  terminalResize(params: { cols: number; rows: number }) {
    return this.request<{ ok?: boolean }>("terminal.resize", params);
  }

  // MCP
  reloadMcp(params: { session_id: string }) {
    return this.request<{ ok?: boolean }>("reload.mcp", params);
  }

  // Spawn tree
  spawnTreeSave(params: { session_id: string }) {
    return this.request<{ path?: string; session_id?: string }>("spawn_tree.save", params);
  }

  spawnTreeList() {
    return this.request<{ entries?: unknown[] }>("spawn_tree.list");
  }

  spawnTreeLoad(params: { path: string }) {
    return this.request<Record<string, unknown>>("spawn_tree.load", params);
  }

  // Plugins
  pluginsList(params: { session_id: string }) {
    return this.request<Record<string, unknown>>("plugins.list", params);
  }

  // Agents
  agentsList(params: { session_id: string }) {
    return this.request<Record<string, unknown>>("agents.list", params);
  }

  // Insights
  insightsGet(params: { session_id: string }) {
    return this.request<Record<string, unknown>>("insights.get", params);
  }

  // Setup status
  setupStatus() {
    return this.request<{ provider_configured?: boolean }>("setup.status");
  }
}

// ── Singleton ───────────────────────────────────────────────────────

let _instance: GatewayClient | null = null;

export function getGatewayClient(url?: string): GatewayClient {
  if (!_instance) {
    _instance = new GatewayClient(url);
  }
  return _instance;
}
