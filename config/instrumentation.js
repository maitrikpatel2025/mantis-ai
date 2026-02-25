let initialized = false;
async function register() {
  if (typeof window !== "undefined" || initialized) return;
  initialized = true;
  if (process.argv.includes("build")) return;
  const dotenv = await import("dotenv");
  dotenv.config();
  if (!process.env.AUTH_SECRET) {
    console.error("\n  ERROR: AUTH_SECRET is not set in your .env file.");
    console.error("  This is required for session encryption.");
    console.error('  Run "npm run setup" to generate it automatically, or add manually:');
    console.error("  openssl rand -base64 32\n");
    throw new Error("AUTH_SECRET environment variable is required");
  }
  console.log("[mantis] step: initDatabase");
  const { initDatabase } = await import("../lib/db/index.js");
  initDatabase();
  console.log("[mantis] step: interceptConsole");
  const { interceptConsole } = await import("../lib/logs/buffer.js");
  interceptConsole();
  console.log("[mantis] step: initChannelRegistry");
  const { initChannelRegistry } = await import("../lib/channels/registry.js");
  await initChannelRegistry();
  console.log("[mantis] step: loadCrons");
  const { loadCrons } = await import("../lib/cron.js");
  loadCrons();
  console.log("[mantis] step: startBuiltinCrons");
  const { startBuiltinCrons, setUpdateAvailable } = await import("../lib/cron.js");
  startBuiltinCrons();
  console.log("[mantis] step: startHealthChecks");
  const { startHealthChecks } = await import("../lib/health/index.js");
  startHealthChecks();
  try {
    const { getAvailableVersion } = await import("../lib/db/update-check.js");
    const stored = getAvailableVersion();
    if (stored) setUpdateAvailable(stored);
  } catch {
  }
  try {
    const { isLocalExecutionEnabled } = await import("../lib/execution/router.js");
    if (isLocalExecutionEnabled()) {
      console.log("[mantis] step: cleanupOrphanedContainers");
      const { cleanupOrphanedContainers } = await import("../lib/execution/local-runner.js");
      await cleanupOrphanedContainers();
    }
  } catch (err) {
    console.error("[mantis] Orphaned container cleanup failed:", err.message);
  }
  try {
    const { isLocalExecutionEnabled: localEnabled, getWarmPoolSize } = await import("../lib/execution/router.js");
    if (localEnabled() && getWarmPoolSize() > 0) {
      console.log("[mantis] step: initWarmPool");
      const { initWarmPool } = await import("../lib/execution/warm-pool.js");
      await initWarmPool();
    }
  } catch (err) {
    console.error("[mantis] Warm pool initialization failed:", err.message);
  }
  if (process.env.GATEWAY_ENABLED === "true") {
    console.log("[mantis] step: startGateway");
    try {
      const { startGateway } = await import("../lib/gateway/index.js");
      startGateway();
    } catch (err) {
      console.error("[mantis] Gateway startup failed:", err.message);
    }
  }
  try {
    const { isWorkspaceEnabled } = await import("../lib/execution/workspace.js");
    if (isWorkspaceEnabled()) {
      console.log("[mantis] step: cleanupOrphanedWorkspace");
      const { execSync } = await import("child_process");
      try {
        execSync("docker rm -f mantis-workspace", { stdio: "ignore", timeout: 15e3 });
      } catch {
      }
    }
  } catch {
  }
  console.log("[mantis] step: precompileRoutes");
  try {
    const { loadTriggers } = await import("../lib/triggers.js");
    loadTriggers();
    await import("../api/index.js");
    await import("../lib/chat/api.js");
    console.log("[mantis] \u2713 SSE VERIFIED: all routes pre-compiled, this MUST appear instantly");
  } catch (err) {
    console.error("[mantis] Route pre-compilation failed:", err.message);
  }
  const shutdownHandler = async (signal) => {
    console.log(`[mantis] ${signal} received, shutting down...`);
    try {
      const { shutdownWarmPool } = await import("../lib/execution/warm-pool.js");
      await shutdownWarmPool();
    } catch {
    }
    try {
      const { shutdownWorkspace } = await import("../lib/execution/workspace.js");
      await shutdownWorkspace();
    } catch {
    }
    try {
      const { stopGateway } = await import("../lib/gateway/index.js");
      await stopGateway();
    } catch {
    }
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdownHandler("SIGTERM"));
  process.on("SIGINT", () => shutdownHandler("SIGINT"));
  console.log("mantis-ai initialized");
}
export {
  register
};
