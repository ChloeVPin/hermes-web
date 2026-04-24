/**
 * TypeScript types for the hermes-agent tui_gateway JSON-RPC protocol.
 * Ported from hermes-agent/ui-tui/src/gatewayTypes.ts
 */

// ── Core types ──────────────────────────────────────────────────────

export type Role = "assistant" | "system" | "tool" | "user";

export interface SessionInfo {
  cwd?: string;
  mcp_servers?: McpServerStatus[];
  model: string;
  release_date?: string;
  skills: Record<string, string[]>;
  tools: Record<string, string[]>;
  update_behind?: number | null;
  update_command?: string;
  usage?: Usage;
  version?: string;
}

export interface Usage {
  calls: number;
  context_max?: number;
  context_percent?: number;
  context_used?: number;
  cost_usd?: number;
  input: number;
  output: number;
  total: number;
}

export interface McpServerStatus {
  connected: boolean;
  name: string;
  tools: number;
  transport: string;
}

export interface GatewaySkin {
  banner_hero?: string;
  banner_logo?: string;
  branding?: Record<string, string>;
  colors?: Record<string, string>;
  help_header?: string;
  tool_prefix?: string;
}

export interface TranscriptMessage {
  context?: string;
  name?: string;
  role: Role;
  text?: string;
}

// ── Slash commands ──────────────────────────────────────────────────

export interface SlashCategory {
  name: string;
  pairs: [string, string][];
}

export interface CommandsCatalogResponse {
  canon?: Record<string, string>;
  categories?: SlashCategory[];
  pairs?: [string, string][];
  skill_count?: number;
  sub?: Record<string, string[]>;
  warning?: string;
}

export interface CompletionItem {
  display: string;
  meta?: string;
  text: string;
}

export interface CompletionResponse {
  items?: CompletionItem[];
  replace_from?: number;
}

export type CommandDispatchResponse =
  | { output?: string; type: "exec" | "plugin" }
  | { target: string; type: "alias" }
  | { message?: string; name: string; type: "skill" }
  | { message: string; type: "send" };

// ── Session lifecycle ───────────────────────────────────────────────

export interface SessionCreateResponse {
  info?: SessionInfo & { credential_warning?: string };
  session_id: string;
}

export interface SessionResumeResponse {
  info?: SessionInfo;
  message_count?: number;
  messages: TranscriptMessage[];
  resumed?: string;
  session_id: string;
}

export interface SessionListItem {
  id: string;
  message_count: number;
  preview: string;
  source?: string;
  started_at: number;
  title: string;
}

export interface SessionListResponse {
  sessions?: SessionListItem[];
}

export interface SessionUsageResponse {
  cache_read?: number;
  cache_write?: number;
  calls?: number;
  compressions?: number;
  context_max?: number;
  context_percent?: number;
  context_used?: number;
  cost_status?: "estimated" | "exact";
  cost_usd?: number;
  input?: number;
  model?: string;
  output?: number;
  total?: number;
}

export interface SessionCompressResponse {
  info?: SessionInfo;
  messages?: TranscriptMessage[];
  removed?: number;
  usage?: Usage;
}

export interface SessionBranchResponse {
  session_id?: string;
  title?: string;
}

// ── Prompt / submission ─────────────────────────────────────────────

export interface PromptSubmitResponse {
  ok?: boolean;
}

export interface BackgroundStartResponse {
  task_id?: string;
}

// ── Interactive flows ───────────────────────────────────────────────

export interface ClarifyRequest {
  choices: string[] | null;
  question: string;
  request_id: string;
}

export interface ApprovalRequest {
  command: string;
  description: string;
}

export interface SudoRequest {
  request_id: string;
}

export interface SecretRequest {
  env_var: string;
  prompt: string;
  request_id: string;
}

// ── Tools ───────────────────────────────────────────────────────────

export interface ToolsConfigureResponse {
  changed?: string[];
  enabled_toolsets?: string[];
  info?: SessionInfo;
  missing_servers?: string[];
  reset?: boolean;
  unknown?: string[];
}

// ── Model picker ────────────────────────────────────────────────────

export interface ModelOptionProvider {
  is_current?: boolean;
  models?: string[];
  name: string;
  slug: string;
  total_models?: number;
  warning?: string;
}

export interface ModelOptionsResponse {
  model?: string;
  provider?: string;
  providers?: ModelOptionProvider[];
}

// ── Subagent events ─────────────────────────────────────────────────

export interface SubagentEventPayload {
  api_calls?: number;
  cost_usd?: number;
  depth?: number;
  duration_seconds?: number;
  files_read?: string[];
  files_written?: string[];
  goal: string;
  input_tokens?: number;
  iteration?: number;
  model?: string;
  output_tail?: { is_error?: boolean; preview?: string; tool?: string }[];
  output_tokens?: number;
  parent_id?: null | string;
  reasoning_tokens?: number;
  status?: "completed" | "failed" | "interrupted" | "queued" | "running";
  subagent_id?: string;
  summary?: string;
  task_count?: number;
  task_index: number;
  text?: string;
  tool_count?: number;
  tool_name?: string;
  tool_preview?: string;
  toolsets?: string[];
}

// ── Delegation ──────────────────────────────────────────────────────

export interface DelegationStatusResponse {
  active?: {
    depth?: number;
    goal?: string;
    model?: null | string;
    parent_id?: null | string;
    started_at?: number;
    status?: string;
    subagent_id?: string;
    tool_count?: number;
  }[];
  max_concurrent_children?: number;
  max_spawn_depth?: number;
  paused?: boolean;
}

// ── Config ──────────────────────────────────────────────────────────

export interface ConfigDisplayConfig {
  bell_on_complete?: boolean;
  details_mode?: string;
  inline_diffs?: boolean;
  show_cost?: boolean;
  show_reasoning?: boolean;
  streaming?: boolean;
  thinking_mode?: string;
  tui_compact?: boolean;
  tui_statusbar?: "bottom" | "off" | "on" | "top" | boolean;
}

export interface ConfigSetResponse {
  credential_warning?: string;
  history_reset?: boolean;
  info?: SessionInfo;
  value?: string;
  warning?: string;
}

// ── Voice ───────────────────────────────────────────────────────────

export interface VoiceToggleResponse {
  audio_available?: boolean;
  available?: boolean;
  details?: string;
  enabled?: boolean;
  stt_available?: boolean;
  tts?: boolean;
}

// ── Shell ───────────────────────────────────────────────────────────

export interface ShellExecResponse {
  code: number;
  stderr?: string;
  stdout?: string;
}

// ── All gateway events ──────────────────────────────────────────────

export type GatewayEvent =
  | { payload?: { skin?: GatewaySkin }; session_id?: string; type: "gateway.ready" }
  | { payload?: GatewaySkin; session_id?: string; type: "skin.changed" }
  | { payload: SessionInfo; session_id?: string; type: "session.info" }
  | { payload?: { text?: string }; session_id?: string; type: "thinking.delta" }
  | { payload?: undefined; session_id?: string; type: "message.start" }
  | { payload?: { kind?: string; text?: string }; session_id?: string; type: "status.update" }
  | { payload?: { state?: "idle" | "listening" | "transcribing" }; session_id?: string; type: "voice.status" }
  | { payload?: { no_speech_limit?: boolean; text?: string }; session_id?: string; type: "voice.transcript" }
  | { payload?: { cwd?: string; python?: string }; session_id?: string; type: "gateway.start_timeout" }
  | { payload?: { preview?: string }; session_id?: string; type: "gateway.protocol_error" }
  | { payload?: { text?: string }; session_id?: string; type: "reasoning.delta" | "reasoning.available" }
  | { payload: { name?: string; preview?: string }; session_id?: string; type: "tool.progress" }
  | { payload: { name?: string }; session_id?: string; type: "tool.generating" }
  | { payload: { context?: string; name?: string; tool_id: string }; session_id?: string; type: "tool.start" }
  | { payload: { error?: string; inline_diff?: string; name?: string; summary?: string; tool_id: string }; session_id?: string; type: "tool.complete" }
  | { payload: { choices: string[] | null; question: string; request_id: string }; session_id?: string; type: "clarify.request" }
  | { payload: { command: string; description: string }; session_id?: string; type: "approval.request" }
  | { payload: { request_id: string }; session_id?: string; type: "sudo.request" }
  | { payload: { env_var: string; prompt: string; request_id: string }; session_id?: string; type: "secret.request" }
  | { payload: { task_id: string; text: string }; session_id?: string; type: "background.complete" }
  | { payload: { text: string }; session_id?: string; type: "btw.complete" }
  | { payload: SubagentEventPayload; session_id?: string; type: "subagent.spawn_requested" }
  | { payload: SubagentEventPayload; session_id?: string; type: "subagent.start" }
  | { payload: SubagentEventPayload; session_id?: string; type: "subagent.thinking" }
  | { payload: SubagentEventPayload; session_id?: string; type: "subagent.tool" }
  | { payload: SubagentEventPayload; session_id?: string; type: "subagent.progress" }
  | { payload: SubagentEventPayload; session_id?: string; type: "subagent.complete" }
  | { payload: { rendered?: string; text?: string }; session_id?: string; type: "message.delta" }
  | { payload?: { reasoning?: string; rendered?: string; text?: string; usage?: Usage }; session_id?: string; type: "message.complete" }
  | { payload?: { message?: string }; session_id?: string; type: "error" };

export type GatewayEventType = GatewayEvent["type"];
