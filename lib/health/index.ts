import { emitEvent } from '../events/bus.js';

// ---------------------------------------------------------------------------
// Health check component types
// ---------------------------------------------------------------------------

type ComponentStatus = 'ok' | 'down' | 'degraded' | 'unknown';
type OverallStatus = ComponentStatus;

interface DatabaseHealth {
  status: ComponentStatus;
  latencyMs: number | null;
  checkedAt: number | null;
}

interface LlmHealth {
  status: ComponentStatus;
  latencyMs: number | null;
  checkedAt: number | null;
}

interface ChannelsHealth {
  status: ComponentStatus;
  enabled: number;
  total: number;
  checkedAt: number | null;
}

interface GatewayHealth {
  status: ComponentStatus;
  connections: number;
  checkedAt: number | null;
}

interface HealthComponents {
  database: DatabaseHealth;
  llm: LlmHealth;
  channels: ChannelsHealth;
  gateway: GatewayHealth;
}

interface HealthState {
  overall: OverallStatus;
  components: HealthComponents;
  _llmCacheExpiry: number;
  _interval: ReturnType<typeof setInterval> | null;
}

export interface HealthStatusResult {
  overall: OverallStatus;
  components: HealthComponents;
}

// ---------------------------------------------------------------------------
// Global singleton
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var __mantis_health: HealthState | undefined;
}

const KEY = '__mantis_health' as const;

if (!globalThis[KEY]) {
  globalThis[KEY] = {
    overall: 'unknown',
    components: {
      database: { status: 'unknown', latencyMs: null, checkedAt: null },
      llm: { status: 'unknown', latencyMs: null, checkedAt: null },
      channels: { status: 'unknown', enabled: 0, total: 0, checkedAt: null },
      gateway: { status: 'unknown', connections: 0, checkedAt: null },
    },
    _llmCacheExpiry: 0,
    _interval: null,
  };
}

function getState(): HealthState {
  return globalThis[KEY]!;
}

function computeOverall(components: HealthComponents): OverallStatus {
  const statuses: ComponentStatus[] = Object.values(components).map(
    (c: { status: ComponentStatus }) => c.status,
  );
  if (statuses.every((s) => s === 'ok')) return 'ok';
  if (statuses.some((s) => s === 'down')) return 'down';
  if (statuses.some((s) => s === 'degraded')) return 'degraded';
  return 'unknown';
}

async function checkDatabase(): Promise<DatabaseHealth> {
  try {
    const { getDb } = await import('../db/index.js');
    const db = getDb();
    const start = Date.now();
    db.all('SELECT 1');
    const latencyMs = Date.now() - start;
    return { status: 'ok', latencyMs, checkedAt: Date.now() };
  } catch {
    return { status: 'down', latencyMs: null, checkedAt: Date.now() };
  }
}

async function checkLlm(state: HealthState): Promise<LlmHealth> {
  // Cache LLM result for 5 minutes to avoid API cost
  if (Date.now() < state._llmCacheExpiry && state.components.llm.status !== 'unknown') {
    return state.components.llm;
  }
  try {
    const { testLlmConnection } = await import('../debug/index.js');
    const result = await testLlmConnection();
    state._llmCacheExpiry = Date.now() + 5 * 60 * 1000;
    return {
      status: result.success ? 'ok' : 'down',
      latencyMs: result.latencyMs || null,
      checkedAt: Date.now(),
    };
  } catch {
    state._llmCacheExpiry = Date.now() + 60 * 1000; // Retry sooner on error
    return { status: 'down', latencyMs: null, checkedAt: Date.now() };
  }
}

async function checkChannels(): Promise<ChannelsHealth> {
  try {
    const { getChannelRegistry } = await import('../channels/registry.js');
    const all = getChannelRegistry().getAll();
    const enabled = all.filter((c: { enabled: boolean }) => c.enabled).length;
    return {
      status: 'ok',
      enabled,
      total: all.length,
      checkedAt: Date.now(),
    };
  } catch {
    return { status: 'degraded', enabled: 0, total: 0, checkedAt: Date.now() };
  }
}

async function checkGateway(): Promise<GatewayHealth> {
  if (process.env.GATEWAY_ENABLED !== 'true') {
    return { status: 'ok', connections: 0, checkedAt: Date.now() };
  }
  try {
    const { getGateway } = await import('../gateway/index.js');
    const gw = getGateway();
    if (!gw) {
      return { status: 'down', connections: 0, checkedAt: Date.now() };
    }
    return { status: 'ok', connections: gw.connectionCount, checkedAt: Date.now() };
  } catch {
    return { status: 'degraded', connections: 0, checkedAt: Date.now() };
  }
}

async function runHealthCheck(): Promise<void> {
  const state = getState();
  const prevOverall = state.overall;

  const [db, llm, channels, gateway] = await Promise.all([
    checkDatabase(),
    checkLlm(state),
    checkChannels(),
    checkGateway(),
  ]);

  state.components.database = db;
  state.components.llm = llm;
  state.components.channels = channels;
  state.components.gateway = gateway;
  state.overall = computeOverall(state.components);

  if (state.overall !== prevOverall) {
    emitEvent('health:changed', {
      overall: state.overall,
      components: { ...state.components },
    });
  }
}

/**
 * Start periodic health checks. Called from instrumentation.
 */
export function startHealthChecks(): void {
  const state = getState();
  if (state._interval) return;

  // Run initial check
  runHealthCheck().catch(() => {});

  // Then every 30s
  state._interval = setInterval(() => {
    runHealthCheck().catch(() => {});
  }, 30000);
}

/**
 * Get cached health status synchronously.
 */
export function getHealthStatus(): HealthStatusResult {
  const state = getState();
  return {
    overall: state.overall,
    components: { ...state.components },
  };
}
