/**
 * React hook for managing the hermes-agent gateway connection.
 *
 * Provides session lifecycle, message streaming, slash commands,
 * interactive flows (clarify/approval/sudo), and all TUI features
 * over the WebSocket bridge.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { GatewayClient, getGatewayClient, type ConnectionState, type ConnectionStatus } from "./gateway-client";
import type {
  GatewayEvent,
  SessionInfo,
  SessionListItem,
  Usage,
  SubagentEventPayload,
  ClarifyRequest,
  ApprovalRequest,
  SudoRequest,
  SecretRequest,
  CommandsCatalogResponse,
} from "./gateway-types";
import type { SlashMenuItem } from "@/components/hermes/hermes-slash-menu";

// ── Message types for the UI ────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  thinking?: string;
  reasoning?: string;
  tools?: ActiveTool[];
  usage?: Usage;
  isStreaming?: boolean;
}

export interface ActiveTool {
  id: string;
  name: string;
  context?: string;
  summary?: string;
  error?: string;
  status: "running" | "complete" | "error";
}

export interface ActiveSubagent {
  id: string;
  goal: string;
  status: string;
  depth: number;
  toolCount: number;
  summary?: string;
}

// ── Hook state ──────────────────────────────────────────────────────

export interface GatewayState {
  // Connection
  connectionState: ConnectionState;
  connectionStatus: ConnectionStatus;
  connect: () => void;
  disconnect: () => void;

  // Session
  sessionId: string | null;
  sessionInfo: SessionInfo | null;
  sessions: SessionListItem[];
  createSession: (params?: { model?: string; provider?: string }) => Promise<void>;
  resumeSession: (id: string) => Promise<void>;
  closeSession: () => Promise<void>;
  deleteSession: (id: string) => Promise<boolean>;
  renameSession: (id: string, title: string) => Promise<boolean>;
  listSessions: () => Promise<void>;
  branchSession: () => Promise<string | undefined>;
  undoMessages: (count?: number) => Promise<number>;
  compressSession: () => Promise<void>;
  interruptSession: () => Promise<void>;

  // Chat
  messages: ChatMessage[];
  isAgentWorking: boolean;
  sendMessage: (text: string, images?: string[]) => Promise<void>;
  sendBackground: (text: string) => Promise<string | undefined>;
  sendBtw: (text: string) => Promise<void>;
  steerAgent: (text: string) => Promise<void>;

  // Interactive flows
  pendingClarify: ClarifyRequest | null;
  pendingApproval: ApprovalRequest | null;
  pendingSudo: SudoRequest | null;
  pendingSecret: SecretRequest | null;
  respondClarify: (answer: string) => Promise<void>;
  respondApproval: (approved: boolean) => Promise<void>;
  respondSudo: (password: string) => Promise<void>;
  respondSecret: (value: string) => Promise<void>;

  // Slash commands
  executeSlash: (command: string, args?: string) => Promise<string | undefined>;
  dispatchCommand: (input: string) => Promise<void>;
  catalogCommands: SlashMenuItem[];
  refreshCatalog: () => Promise<void>;

  // Tools & subagents
  activeTools: ActiveTool[];
  activeSubagents: ActiveSubagent[];

  // Raw client access for advanced use
  client: GatewayClient;
}

// ── Hook implementation ─────────────────────────────────────────────

export function useGateway(bridgeUrl?: string): GatewayState {
  const clientRef = useRef<GatewayClient>(getGatewayClient(bridgeUrl));
  const client = clientRef.current;

  // Connection
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({ state: "disconnected" });
  const connectionState = connectionStatus.state;

  // Session
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isAgentWorking, setIsAgentWorking] = useState(false);

  // Interactive flows
  const [pendingClarify, setPendingClarify] = useState<ClarifyRequest | null>(null);
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
  const [pendingSudo, setPendingSudo] = useState<SudoRequest | null>(null);
  const [pendingSecret, setPendingSecret] = useState<SecretRequest | null>(null);

  // Tools & subagents
  const [activeTools, setActiveTools] = useState<ActiveTool[]>([]);
  const [activeSubagents, setActiveSubagents] = useState<ActiveSubagent[]>([]);
  const activeToolsRef = useRef<ActiveTool[]>([]);
  // Keep ref in sync with state for use inside event handler closures
  useEffect(() => { activeToolsRef.current = activeTools; }, [activeTools]);

  // Slash commands catalog from gateway
  const [catalogCommands, setCatalogCommands] = useState<SlashMenuItem[]>([]);

  // Streaming accumulator refs
  const streamingTextRef = useRef("");
  const streamingThinkingRef = useRef("");
  const streamingReasoningRef = useRef("");
  const msgIdCounter = useRef(0);

  const nextMsgId = () => `msg-${++msgIdCounter.current}-${Date.now()}`;

  // ── Connection management ─────────────────────────────────────

  useEffect(() => {
    const unsub = client.onConnection(setConnectionStatus);
    return unsub;
  }, [client]);

  const connect = useCallback(() => client.connect(), [client]);
  const disconnect = useCallback(() => client.disconnect(), [client]);

  // ── Event handling ────────────────────────────────────────────

  useEffect(() => {
    const unsub = client.onAny((event: GatewayEvent) => {
      switch (event.type) {
        case "gateway.ready":
          // Gateway subprocess is up, no action needed, connection is already set
          break;

        case "session.info":
          setSessionInfo(event.payload);
          break;

        case "message.start":
          setIsAgentWorking(true);
          streamingTextRef.current = "";
          streamingThinkingRef.current = "";
          streamingReasoningRef.current = "";
          // Only add a new streaming placeholder if the last message isn't already streaming
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.isStreaming) {
              // Already have a streaming message, don't create another
              return prev;
            }
            return [
              ...prev,
              {
                id: nextMsgId(),
                role: "assistant",
                content: "",
                timestamp: Date.now(),
                isStreaming: true,
              },
            ];
          });
          break;

        case "message.delta": {
          const text = event.payload?.text ?? event.payload?.rendered ?? "";
          streamingTextRef.current += text;
          const current = streamingTextRef.current;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.isStreaming) {
              return [...prev.slice(0, -1), { ...last, content: current }];
            }
            return prev;
          });
          break;
        }

        case "message.complete": {
          const finalText = event.payload?.text ?? event.payload?.rendered ?? streamingTextRef.current;
          const usage = event.payload?.usage;
          const reasoning = event.payload?.reasoning ?? (streamingReasoningRef.current || undefined);
          
          // If the message has no visible content (tool-calling turn), keep the
          // placeholder streaming so the next message.start reuses it instead of
          // creating a new bubble. Only finalize when there's actual text.
          const hasContent = finalText && finalText.trim().length > 0;
          
          if (hasContent) {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.isStreaming) {
                return [
                  ...prev.slice(0, -1),
                  { ...last, content: finalText, usage, reasoning, isStreaming: false },
                ];
              }
              return prev;
            });
            // Snapshot completed tools onto the message (use ref to avoid stale closure)
            const toolsSnapshot = [...activeToolsRef.current];
            if (toolsSnapshot.length > 0) {
              setMessages((prev2) => {
                const last2 = prev2[prev2.length - 1];
                if (last2 && !last2.isStreaming) {
                  return [...prev2.slice(0, -1), { ...last2, tools: toolsSnapshot }];
                }
                return prev2;
              });
            }
            setActiveTools([]);
            setIsAgentWorking(false);
          }
          // Always reset streaming accumulators for the next turn
          streamingTextRef.current = "";
          streamingThinkingRef.current = "";
          streamingReasoningRef.current = "";
          break;
        }

        case "thinking.delta": {
          const text = event.payload?.text ?? "";
          streamingThinkingRef.current += text;
          const current = streamingThinkingRef.current;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.isStreaming) {
              return [...prev.slice(0, -1), { ...last, thinking: current }];
            }
            return prev;
          });
          break;
        }

        case "reasoning.delta":
        case "reasoning.available": {
          const text = event.payload?.text ?? "";
          streamingReasoningRef.current += text;
          const current = streamingReasoningRef.current;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.isStreaming) {
              return [...prev.slice(0, -1), { ...last, reasoning: current }];
            }
            return prev;
          });
          break;
        }

        case "tool.start":
          setActiveTools((prev) => [
            ...prev,
            {
              id: event.payload.tool_id,
              name: event.payload.name ?? "tool",
              context: event.payload.context,
              status: "running",
            },
          ]);
          break;

        case "tool.generating":
          setActiveTools((prev) =>
            prev.map((t) =>
              t.name === event.payload.name
                ? { ...t, status: "running" }
                : t
            )
          );
          break;

        case "tool.progress":
          setActiveTools((prev) =>
            prev.map((t) =>
              t.name === event.payload.name
                ? { ...t, summary: event.payload.preview }
                : t
            )
          );
          break;

        case "tool.complete":
          setActiveTools((prev) =>
            prev.map((t) =>
              t.id === event.payload.tool_id
                ? { ...t, status: event.payload.error ? "error" : "complete", summary: event.payload.summary, error: event.payload.error }
                : t
            )
          );
          break;

        case "clarify.request":
          setPendingClarify({
            question: event.payload.question,
            choices: event.payload.choices,
            request_id: event.payload.request_id,
          });
          break;

        case "approval.request":
          setPendingApproval({
            command: event.payload.command,
            description: event.payload.description,
          });
          break;

        case "sudo.request":
          setPendingSudo({ request_id: event.payload.request_id });
          break;

        case "secret.request":
          setPendingSecret({
            env_var: event.payload.env_var,
            prompt: event.payload.prompt,
            request_id: event.payload.request_id,
          });
          break;

        case "subagent.start":
        case "subagent.spawn_requested":
          setActiveSubagents((prev) => [
            ...prev.filter((s) => s.id !== event.payload.subagent_id),
            {
              id: event.payload.subagent_id ?? `sa-${Date.now()}`,
              goal: event.payload.goal,
              status: event.payload.status ?? "running",
              depth: event.payload.depth ?? 0,
              toolCount: event.payload.tool_count ?? 0,
            },
          ]);
          break;

        case "subagent.progress":
        case "subagent.thinking":
        case "subagent.tool":
          setActiveSubagents((prev) =>
            prev.map((s) =>
              s.id === event.payload.subagent_id
                ? { ...s, status: event.payload.status ?? s.status, toolCount: event.payload.tool_count ?? s.toolCount }
                : s
            )
          );
          break;

        case "subagent.complete":
          setActiveSubagents((prev) =>
            prev.map((s) =>
              s.id === event.payload.subagent_id
                ? { ...s, status: "completed", summary: event.payload.summary }
                : s
            )
          );
          break;

        case "status.update":
          // General status updates from the agent (e.g. "reading file…")
          break;
        case "gateway.protocol_error":
        case "gateway.start_timeout":
          // Gateway-level errors, show as system message
          {
            const errMsg =
              event.type === "gateway.protocol_error"
                ? event.payload?.preview ?? "Protocol error"
                : "Gateway start timeout";
            setMessages((prev) => [
              ...prev,
              { id: nextMsgId(), role: "system", content: `[gateway] ${errMsg}`, timestamp: Date.now() },
            ]);
          }
          break;


        case "skin.changed":
          // Branding/skin update, could be used for custom theming
          break;

        case "error":
          // Add error as system message
          if (event.payload?.message) {
            setMessages((prev) => [
              ...prev,
              {
                id: nextMsgId(),
                role: "system",
                content: `Error: ${event.payload?.message}`,
                timestamp: Date.now(),
              },
            ]);
          }
          setIsAgentWorking(false);
          break;

        case "background.complete":
          setMessages((prev) => [
            ...prev,
            {
              id: nextMsgId(),
              role: "assistant",
              content: event.payload.text,
              timestamp: Date.now(),
            },
          ]);
          break;

        case "btw.complete":
          setMessages((prev) => [
            ...prev,
            {
              id: nextMsgId(),
              role: "system",
              content: `[btw] ${event.payload.text}`,
              timestamp: Date.now(),
            },
          ]);
          break;

        case "voice.transcript":
          if (event.payload?.text) {
            setMessages((prev) => [
              ...prev,
              {
                id: nextMsgId(),
                role: "system",
                content: `[voice] ${event.payload!.text}`,
                timestamp: Date.now(),
              },
            ]);
          }
          break;

        default:
          break;
      }
    });

    return unsub;
  }, [client]);

  // ── Session lifecycle ─────────────────────────────────────────

  const createSession = useCallback(
    async (params: { model?: string; provider?: string } = {}) => {
      const res = await client.sessionCreate(params);
      setSessionId(res.session_id);
      if (res.info) setSessionInfo(res.info);
      setMessages([]);
      setActiveTools([]);
      setActiveSubagents([]);
      setIsAgentWorking(false);
      setPendingClarify(null);
      setPendingApproval(null);
      setPendingSudo(null);
      setPendingSecret(null);
      // Fetch dynamic slash commands
      fetchCatalog(res.session_id);
    },
    [client]
  );

  const resumeSession = useCallback(
    async (id: string) => {
      try {
        const res = await client.sessionResume({ session_id: id });
        setSessionId(res.session_id);
        if (res.info) setSessionInfo(res.info);
        // Convert transcript messages to ChatMessages
        const restored: ChatMessage[] = (res.messages ?? []).map((m, i) => ({
          id: `restored-${i}`,
          role: m.role,
          content: m.text ?? "",
          timestamp: Date.now() - (res.messages.length - i) * 1000,
        }));
        setMessages(restored);
        setActiveTools([]);
        setActiveSubagents([]);
        setIsAgentWorking(false);
        setPendingClarify(null);
        setPendingApproval(null);
        setPendingSudo(null);
        setPendingSecret(null);
        // Fetch dynamic slash commands
        fetchCatalog(res.session_id);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          { id: nextMsgId(), role: "system", content: `Failed to resume session: ${err instanceof Error ? err.message : String(err)}`, timestamp: Date.now() },
        ]);
      }
    },
    [client]
  );

  const fetchCatalog = useCallback(
    async (sid: string) => {
      try {
        const res: CommandsCatalogResponse = await client.commandsCatalog({ session_id: sid });
        const items: SlashMenuItem[] = [];
        if (res.categories) {
          for (const cat of res.categories) {
            for (const [cmd, desc] of cat.pairs) {
              items.push({ command: cmd.startsWith("/") ? cmd : `/${cmd}`, description: desc, category: cat.name });
            }
          }
        } else if (res.pairs) {
          for (const [cmd, desc] of res.pairs) {
            items.push({ command: cmd.startsWith("/") ? cmd : `/${cmd}`, description: desc });
          }
        }
        setCatalogCommands(items);
      } catch {
        // catalog not available, keep defaults
      }
    },
    [client]
  );

  const refreshCatalog = useCallback(async () => {
    if (!sessionId) return;
    await fetchCatalog(sessionId);
  }, [fetchCatalog, sessionId]);

  const closeSession = useCallback(async () => {
    if (!sessionId) return;
    await client.sessionClose({ session_id: sessionId });
    setSessionId(null);
    setSessionInfo(null);
    setMessages([]);
  }, [client, sessionId]);

  const deleteSession = useCallback(
    async (id: string) => {
      console.log("[useGateway] deleteSession called for:", id);
      try {
        const res = await client.sessionDelete({ session_id: id });
        console.log("[useGateway] deleteSession response:", JSON.stringify(res));
        const ok = !!res?.deleted;
        if (ok) {
          setSessions((prev) => prev.filter((s) => s.id !== id));
          // If we deleted the currently active session, create a new one
          if (sessionId === id) {
            setSessionId(null);
            setSessionInfo(null);
            setMessages([]);
            setActiveTools([]);
            setActiveSubagents([]);
            // Create a new session after deleting the active one
            createSession();
          }
        } else {
          console.warn("[useGateway] deleteSession returned not-deleted:", res);
        }
        return ok;
      } catch (err) {
        console.error("[useGateway] deleteSession failed:", err);
        return false;
      }
    },
    [client, sessionId, createSession],
  );

  const renameSession = useCallback(
    async (id: string, title: string) => {
      try {
        const res = await client.sessionRename({ session_id: id, title });
        const ok = !!res?.renamed;
        if (ok) {
          setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
        }
        return ok;
      } catch {
        return false;
      }
    },
    [client]
  );

  const listSessions = useCallback(async () => {
    try {
      const res = await client.sessionList({ limit: 50 });
      setSessions(res.sessions ?? []);
    } catch {
      // Gateway not ready or disconnected, keep current list
    }
  }, [client]);

  const branchSession = useCallback(async () => {
    if (!sessionId) return;
    const res = await client.sessionBranch({ session_id: sessionId });
    return res.session_id ?? undefined;
  }, [client, sessionId]);

  const undoMessages = useCallback(
    async (count = 1) => {
      if (!sessionId) return 0;
      const res = await client.sessionUndo({ session_id: sessionId, count });
      const removed = res.removed ?? 0;
      if (removed > 0) {
        setMessages((prev) => prev.slice(0, -removed));
      }
      return removed;
    },
    [client, sessionId]
  );

  const compressSession = useCallback(async () => {
    if (!sessionId) return;
    const res = await client.sessionCompress({ session_id: sessionId });
    if (res.info) setSessionInfo(res.info);
  }, [client, sessionId]);

  const interruptSession = useCallback(async () => {
    if (!sessionId) return;
    await client.sessionInterrupt({ session_id: sessionId });
    setIsAgentWorking(false);
  }, [client, sessionId]);

  // ── Chat ──────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string, images?: string[]) => {
      if (!sessionId) return;

      // Add user message to local state
      setMessages((prev) => [
        ...prev,
        {
          id: nextMsgId(),
          role: "user",
          content: text,
          timestamp: Date.now(),
        },
      ]);

      // Check if it's a slash command
      if (text.startsWith("/")) {
        const parts = text.slice(1).split(/\s+/);
        const name = parts[0];
        const arg = parts.slice(1).join(" ");
        
        // Special case: /model without args should show current model via session.info
        // (slash.worker can't open interactive picker in non-TTY subprocess)
        if (name === "model" && !arg) {
          try {
            const info = sessionInfo;
            if (info) {
              const output = `Current model: ${info.model || "unknown"}`;
              setMessages((prev) => [
                ...prev,
                { id: nextMsgId(), role: "system", content: output, timestamp: Date.now() },
              ]);
            } else {
              setMessages((prev) => [
                ...prev,
                { id: nextMsgId(), role: "system", content: "/model: session info not available", timestamp: Date.now() },
              ]);
            }
          } catch {
            setMessages((prev) => [
              ...prev,
              { id: nextMsgId(), role: "system", content: "/model: failed to get session info", timestamp: Date.now() },
            ]);
          }
          return;
        }
        
        // Special case: /compress should use session.compress method directly
        // (slash.worker doesn't share gateway session state)
        if (name === "compress") {
          try {
            const res = await client.request<{ status: string; removed: number; usage: any }>("session.compress", { session_id: sessionId, focus_topic: arg });
            if (res) {
              const output = `Compressed: removed ${res.removed} messages`;
              setMessages((prev) => [
                ...prev,
                { id: nextMsgId(), role: "system", content: output, timestamp: Date.now() },
              ]);
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            setMessages((prev) => [
              ...prev,
              { id: nextMsgId(), role: "system", content: `/compress failed: ${errMsg}`, timestamp: Date.now() },
            ]);
          }
          return;
        }
        
        // Special case: /skills should use skills.manage method directly
        // (slash.worker doesn't share gateway session state)
        if (name === "skills") {
          try {
            const skillParts = arg.split(/\s+/);
            const action = skillParts[0] || "list";
            const skillName = skillParts.slice(1).join(" ");
            const res = await client.skillsManage({ session_id: sessionId, action, name: skillName || undefined });
            // Convert response to string output
            const output = typeof res === "object" ? JSON.stringify(res, null, 2) : String(res);
            setMessages((prev) => [
              ...prev,
              { id: nextMsgId(), role: "system", content: output, timestamp: Date.now() },
            ]);
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            setMessages((prev) => [
              ...prev,
              { id: nextMsgId(), role: "system", content: `/skills failed: ${errMsg}`, timestamp: Date.now() },
            ]);
          }
          return;
        }
        
        try {
          // Try command.dispatch first (handles quick commands, plugins, skills)
          const res = await client.commandDispatch({ session_id: sessionId, name, arg });
          if (res.type === "send") {
            await client.promptSubmit({ session_id: sessionId, text: res.message, images });
          } else if (res.type === "exec" || res.type === "plugin") {
            if (res.output) {
              setMessages((prev) => [
                ...prev,
                { id: nextMsgId(), role: "system", content: res.output!, timestamp: Date.now() },
              ]);
            }
          } else if (res.type === "alias") {
            await client.promptSubmit({ session_id: sessionId, text: res.target, images });
          } else if (res.type === "skill") {
            if (res.message) {
              setMessages((prev) => [
                ...prev,
                { id: nextMsgId(), role: "system", content: res.message!, timestamp: Date.now() },
              ]);
            }
          }
        } catch {
          // Fallback: try as slash.exec (handles built-in slash commands like /model, /system)
          try {
            const res = await client.slashExec({ session_id: sessionId, command: name, args: arg || undefined });
            const output = res.output || res.warning;
            if (output) {
              setMessages((prev) => [
                ...prev,
                { id: nextMsgId(), role: "system", content: output, timestamp: Date.now() },
              ]);
            } else {
              setMessages((prev) => [
                ...prev,
                { id: nextMsgId(), role: "system", content: `/${name}: (no output)`, timestamp: Date.now() },
              ]);
            }
          } catch (slashErr) {
            const errMsg = slashErr instanceof Error ? slashErr.message : String(slashErr);
            setMessages((prev) => [
              ...prev,
              { id: nextMsgId(), role: "system", content: `/${name} failed: ${errMsg}`, timestamp: Date.now() },
            ]);
          }
        }
        return;
      }

      // Normal message
      try {
        await client.promptSubmit({ session_id: sessionId, text, images });
      } catch (err) {
        setIsAgentWorking(false);
        setMessages((prev) => [
          ...prev,
          { id: nextMsgId(), role: "system", content: `Send failed: ${err instanceof Error ? err.message : String(err)}`, timestamp: Date.now() },
        ]);
      }
    },
    [client, sessionId]
  );

  const sendBackground = useCallback(
    async (text: string) => {
      if (!sessionId) return;
      const res = await client.promptBackground({ session_id: sessionId, text });
      return res.task_id ?? undefined;
    },
    [client, sessionId]
  );

  const sendBtw = useCallback(
    async (text: string) => {
      if (!sessionId) return;
      await client.promptBtw({ session_id: sessionId, text });
    },
    [client, sessionId]
  );

  const steerAgent = useCallback(
    async (text: string) => {
      if (!sessionId) return;
      await client.sessionSteer({ session_id: sessionId, text });
    },
    [client, sessionId]
  );

  // ── Interactive flows ─────────────────────────────────────────

  const respondClarify = useCallback(
    async (answer: string) => {
      if (!sessionId || !pendingClarify) return;
      await client.clarifyRespond({ session_id: sessionId, request_id: pendingClarify.request_id, answer });
      setPendingClarify(null);
    },
    [client, sessionId, pendingClarify]
  );

  const respondApproval = useCallback(
    async (approved: boolean) => {
      if (!sessionId) return;
      await client.approvalRespond({ session_id: sessionId, approved });
      setPendingApproval(null);
    },
    [client, sessionId]
  );

  const respondSudo = useCallback(
    async (password: string) => {
      if (!sessionId || !pendingSudo) return;
      await client.sudoRespond({ session_id: sessionId, request_id: pendingSudo.request_id, password });
      setPendingSudo(null);
    },
    [client, sessionId, pendingSudo]
  );

  const respondSecret = useCallback(
    async (value: string) => {
      if (!sessionId || !pendingSecret) return;
      await client.secretRespond({ session_id: sessionId, request_id: pendingSecret.request_id, value });
      setPendingSecret(null);
    },
    [client, sessionId, pendingSecret]
  );

  // ── Slash commands ────────────────────────────────────────────

  const executeSlash = useCallback(
    async (command: string, args?: string) => {
      if (!sessionId) return;
      const res = await client.slashExec({ session_id: sessionId, command, args });
      return res.output ?? undefined;
    },
    [client, sessionId]
  );

  const dispatchCommand = useCallback(
    async (input: string) => {
      if (!sessionId) return;
      const parts = input.replace(/^\//, "").split(/\s+/);
      const name = parts[0];
      const arg = parts.slice(1).join(" ");
      await client.commandDispatch({ session_id: sessionId, name, arg });
    },
    [client, sessionId]
  );

  return {
    // Connection
    connectionState,
    connectionStatus,
    connect,
    disconnect,

    // Session
    sessionId,
    sessionInfo,
    sessions,
    createSession,
    resumeSession,
    closeSession,
    deleteSession,
    renameSession,
    listSessions,
    branchSession,
    undoMessages,
    compressSession,
    interruptSession,

    // Chat
    messages,
    isAgentWorking,
    sendMessage,
    sendBackground,
    sendBtw,
    steerAgent,

    // Interactive flows
    pendingClarify,
    pendingApproval,
    pendingSudo,
    pendingSecret,
    respondClarify,
    respondApproval,
    respondSudo,
    respondSecret,

    // Slash commands
    executeSlash,
    dispatchCommand,
    catalogCommands,
    refreshCatalog,

    // Tools & subagents
    activeTools,
    activeSubagents,

    // Raw client
    client,
  };
}
