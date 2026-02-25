import { emitEvent } from "../events/bus.js";
const KEY = "__mantis_health";
if (!globalThis[KEY]) {
  globalThis[KEY] = {
    overall: "unknown",
    components: {
      database: { status: "unknown", latencyMs: null, checkedAt: null },
      llm: { status: "unknown", latencyMs: null, checkedAt: null },
      channels: { status: "unknown", enabled: 0, total: 0, checkedAt: null },
      gateway: { status: "unknown", connections: 0, checkedAt: null }
    },
    _llmCacheExpiry: 0,
    _interval: null
  };
}
function getState() {
  return globalThis[KEY];
}
function computeOverall(components) {
  const statuses = Object.values(components).map(
    (c) => c.status
  );
  if (statuses.every((s) => s === "ok")) return "ok";
  if (statuses.some((s) => s === "down")) return "down";
  if (statuses.some((s) => s === "degraded")) return "degraded";
  return "unknown";
}
async function checkDatabase() {
  try {
    const { getDb } = await import("../db/index.js");
    const db = getDb();
    const start = Date.now();
    db.all("SELECT 1");
    const latencyMs = Date.now() - start;
    return { status: "ok", latencyMs, checkedAt: Date.now() };
  } catch {
    return { status: "down", latencyMs: null, checkedAt: Date.now() };
  }
}
async function checkLlm(state) {
  if (Date.now() < state._llmCacheExpiry && state.components.llm.status !== "unknown") {
    return state.components.llm;
  }
  try {
    const { testLlmConnection } = await import("../debug/index.js");
    const result = await testLlmConnection();
    state._llmCacheExpiry = Date.now() + 5 * 60 * 1e3;
    return {
      status: result.success ? "ok" : "down",
      latencyMs: result.latencyMs || null,
      checkedAt: Date.now()
    };
  } catch {
    state._llmCacheExpiry = Date.now() + 60 * 1e3;
    return { status: "down", latencyMs: null, checkedAt: Date.now() };
  }
}
async function checkChannels() {
  try {
    const { getChannelRegistry } = await import("../channels/registry.js");
    const all = getChannelRegistry().getAll();
    const enabled = all.filter((c) => c.enabled).length;
    return {
      status: "ok",
      enabled,
      total: all.length,
      checkedAt: Date.now()
    };
  } catch {
    return { status: "degraded", enabled: 0, total: 0, checkedAt: Date.now() };
  }
}
async function checkGateway() {
  if (process.env.GATEWAY_ENABLED !== "true") {
    return { status: "ok", connections: 0, checkedAt: Date.now() };
  }
  try {
    const { getGateway } = await import("../gateway/index.js");
    const gw = getGateway();
    if (!gw) {
      return { status: "down", connections: 0, checkedAt: Date.now() };
    }
    return { status: "ok", connections: gw.connectionCount, checkedAt: Date.now() };
  } catch {
    return { status: "degraded", connections: 0, checkedAt: Date.now() };
  }
}
async function runHealthCheck() {
  const state = getState();
  const prevOverall = state.overall;
  const [db, llm, channels, gateway] = await Promise.all([
    checkDatabase(),
    checkLlm(state),
    checkChannels(),
    checkGateway()
  ]);
  state.components.database = db;
  state.components.llm = llm;
  state.components.channels = channels;
  state.components.gateway = gateway;
  state.overall = computeOverall(state.components);
  if (state.overall !== prevOverall) {
    emitEvent("health:changed", {
      overall: state.overall,
      components: { ...state.components }
    });
  }
}
function startHealthChecks() {
  const state = getState();
  if (state._interval) return;
  runHealthCheck().catch(() => {
  });
  state._interval = setInterval(() => {
    runHealthCheck().catch(() => {
    });
  }, 3e4);
}
function getHealthStatus() {
  const state = getState();
  return {
    overall: state.overall,
    components: { ...state.components }
  };
}
export {
  getHealthStatus,
  startHealthChecks
};
