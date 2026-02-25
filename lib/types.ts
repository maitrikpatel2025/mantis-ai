/**
 * Core shared type definitions for Mantis AI.
 */

// ---------------------------------------------------------------------------
// Channel types
// ---------------------------------------------------------------------------

export interface Attachment {
  category: 'image' | 'document';
  mimeType: string;
  data: Buffer;
}

export interface ChannelMetadata {
  messageId?: string | number;
  chatId?: string;
  senderId?: string;
  isGroup?: boolean;
  channelId?: string;
  threadTs?: string;
  [key: string]: unknown;
}

export interface NormalizedMessage {
  threadId: string;
  text: string;
  attachments: Attachment[];
  metadata: ChannelMetadata;
}

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
}

export interface ChannelPolicies {
  dm?: 'open' | 'allowlist';
  group?: 'open' | 'allowlist' | 'disabled';
  allowFrom?: string[];
  groupAllowFrom?: string[];
  mediaMaxMb?: number;
}

export interface ChannelStreamingConfig {
  enabled?: boolean;
  updateIntervalMs?: number;
  maxRetries?: number;
}

export interface ChannelConfig {
  id: string;
  type: 'telegram' | 'slack' | 'discord' | 'whatsapp';
  enabled: boolean;
  webhook_path?: string;
  policies?: ChannelPolicies;
  streaming?: ChannelStreamingConfig;
  config: Record<string, string>;
}

export interface ChannelRegistryEntry {
  config: ChannelConfig;
  adapter: ChannelAdapterInterface;
}

// ---------------------------------------------------------------------------
// Channel adapter interface (matches base.js class shape)
// ---------------------------------------------------------------------------

export interface ChannelAdapterInterface {
  channelConfig: ChannelConfig | Record<string, unknown>;
  checkPolicy(metadata: { senderId: string; isGroup: boolean }): PolicyResult;
  receive(request: Request): Promise<NormalizedMessage | null>;
  acknowledge(metadata: ChannelMetadata): Promise<void>;
  startProcessingIndicator(metadata: ChannelMetadata): () => void;
  sendResponse(threadId: string, text: string, metadata?: ChannelMetadata): Promise<void>;
  readonly supportsStreaming: boolean;
  readonly supportsChunkedDelivery: boolean;
  sendStreamChunk?(threadId: string, chunk: string, fullText: string, metadata?: ChannelMetadata): Promise<string | void>;
  sendStreamEnd?(threadId: string, fullText: string, metadata?: ChannelMetadata): Promise<void>;
}

// ---------------------------------------------------------------------------
// AI / Chat types
// ---------------------------------------------------------------------------

export interface ModelOptions {
  model?: string;
  maxTokens?: number;
  fallbacks?: string[];
}

export interface ParsedModelSpec {
  provider: string | null;
  modelName: string | null;
}

export interface ChatOptions {
  threadId?: string;
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  attachments?: Attachment[];
  metadata?: Record<string, unknown>;
}

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'error' | 'done';
  content?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  error?: string;
}

export type ToolPolicyDecision = 'allow' | 'deny' | 'ask';

export interface ToolPolicy {
  agent: string;
  tool: string;
  policy: ToolPolicyDecision;
}

// ---------------------------------------------------------------------------
// Action types (shared by crons and triggers)
// ---------------------------------------------------------------------------

export interface AgentAction {
  type: 'agent';
  job: string;
}

export interface CommandAction {
  type: 'command';
  command: string;
}

export interface WebhookAction {
  type: 'webhook';
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  vars?: Record<string, unknown>;
}

export type ActionConfig = AgentAction | CommandAction | WebhookAction;

export interface ActionExecuteOptions {
  cwd?: string;
  data?: unknown;
  source?: string;
}

// ---------------------------------------------------------------------------
// Cron types
// ---------------------------------------------------------------------------

export interface CronJobConfig {
  name: string;
  schedule: string;
  type?: 'agent' | 'command' | 'webhook';
  enabled?: boolean;
  job?: string;
  command?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  vars?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Trigger types
// ---------------------------------------------------------------------------

export interface TriggerAction {
  type?: 'agent' | 'command' | 'webhook';
  job?: string;
  command?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  vars?: Record<string, unknown>;
}

export interface TriggerConfig {
  name: string;
  watch_path: string;
  actions: TriggerAction[];
  enabled?: boolean;
}

// ---------------------------------------------------------------------------
// Memory types
// ---------------------------------------------------------------------------

export interface Memory {
  id: string;
  category: string;
  content: string;
  sourceJobId?: string | null;
  relevance: number;
  createdAt: number;
  updatedAt: number;
}

export interface MemoryInsert {
  content: string;
  category?: string;
  sourceJobId?: string;
  relevance?: number;
}

// ---------------------------------------------------------------------------
// Job types
// ---------------------------------------------------------------------------

export interface Job {
  id: string;
  prompt: string;
  enrichedPrompt?: string | null;
  status: string;
  source: string;
  branch?: string | null;
  prUrl?: string | null;
  runUrl?: string | null;
  summary?: string | null;
  result?: string | null;
  error?: string | null;
  runnerType?: string | null;
  chatId?: string | null;
  createdAt: number;
  completedAt?: number | null;
}

// ---------------------------------------------------------------------------
// Gateway types
// ---------------------------------------------------------------------------

export interface GatewaySession {
  sessionId: string;
  threadId?: string;
  connectedAt: number;
}

export interface GatewayMessage {
  type: 'chat' | 'set-thread' | 'ping';
  text?: string;
  threadId?: string;
}

export interface GatewayResponse {
  type: 'chunk' | 'done' | 'error' | 'pong' | 'shutdown';
  content?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Security types
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  agentName: string;
  toolName: string;
  args?: string;
  result?: string;
  policy: ToolPolicyDecision;
  decision: 'executed' | 'blocked' | 'approved' | 'denied';
  threadId?: string;
  durationMs?: number;
}

export interface ApprovalRequest {
  id: string;
  agent: string;
  tool: string;
  args: Record<string, unknown>;
  status: 'pending' | 'approved' | 'denied';
  createdAt: number;
}

export interface SanitizeResult {
  text: string;
  sanitized: boolean;
  patternsFound: string[];
}

export interface PairingCode {
  code: string;
  channelId: string;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Database types (inferred from schema)
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: string;
  createdAt: number;
  updatedAt: number;
}

export interface Chat {
  id: string;
  userId: string;
  title: string;
  starred: number;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  chatId: string;
  role: string;
  content: string;
  createdAt: number;
}

export interface Notification {
  id: string;
  notification: string;
  payload: string;
  read: number;
  createdAt: number;
}

export interface Subscription {
  id: string;
  platform: string;
  channelId: string;
  createdAt: number;
}

export interface UsageLog {
  id: string;
  threadId?: string | null;
  model: string;
  provider: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUsd?: number | null;
  durationMs?: number | null;
  source?: string;
  createdAt: number;
}

export interface CronRun {
  id: string;
  cronName: string;
  status: string;
  startedAt: number;
  completedAt?: number | null;
  durationMs?: number | null;
  error?: string | null;
  output?: string | null;
}

export interface Setting {
  id: string;
  type: string;
  key: string;
  value: string;
  createdBy?: string | null;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Event bus types
// ---------------------------------------------------------------------------

export interface DomainEvent {
  type: string;
  data: unknown;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Health check types
// ---------------------------------------------------------------------------

export interface HealthStatus {
  status: 'ok' | 'error';
  version?: string;
  uptime?: number;
  database?: boolean;
  channels?: number;
  gateway?: { connections: number };
  [key: string]: unknown;
}
