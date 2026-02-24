/**
 * Next.js instrumentation hook for Mantis AI.
 * This file is loaded by Next.js on server start when instrumentationHook is enabled.
 *
 * Users should create an instrumentation.js in their project root that imports this:
 *
 *   export { register } from 'mantis-ai/instrumentation';
 *
 * Or they can re-export and add their own logic.
 */

let initialized = false;

export async function register() {
  // Only run on the server, and only once
  if (typeof window !== 'undefined' || initialized) return;
  initialized = true;

  // Skip database init and cron scheduling during `next build` —
  // these are runtime-only concerns that keep the event loop alive
  // and can cause build output corruption.
  if (process.argv.includes('build')) return;

  // Load .env from project root
  const dotenv = await import('dotenv');
  dotenv.config();

  // Validate AUTH_SECRET is set (required by Auth.js for session encryption)
  if (!process.env.AUTH_SECRET) {
    console.error('\n  ERROR: AUTH_SECRET is not set in your .env file.');
    console.error('  This is required for session encryption.');
    console.error('  Run "npm run setup" to generate it automatically, or add manually:');
    console.error('  openssl rand -base64 32\n');
    throw new Error('AUTH_SECRET environment variable is required');
  }

  // Initialize auth database
  console.log('[mantis] step: initDatabase');
  const { initDatabase } = await import('../lib/db/index.js');
  initDatabase();

  // Intercept console for log viewer
  console.log('[mantis] step: interceptConsole');
  const { interceptConsole } = await import('../lib/logs/buffer.js');
  interceptConsole();

  // Initialize channel registry
  console.log('[mantis] step: initChannelRegistry');
  const { initChannelRegistry } = await import('../lib/channels/registry.js');
  await initChannelRegistry();

  // Start cron scheduler
  console.log('[mantis] step: loadCrons');
  const { loadCrons } = await import('../lib/cron.js');
  loadCrons();

  // Start built-in crons (version check)
  console.log('[mantis] step: startBuiltinCrons');
  const { startBuiltinCrons, setUpdateAvailable } = await import('../lib/cron.js');
  startBuiltinCrons();

  // Warm in-memory flag from DB (covers the window before the async cron fetch completes)
  try {
    const { getAvailableVersion } = await import('../lib/db/update-check.js');
    const stored = getAvailableVersion();
    if (stored) setUpdateAvailable(stored);
  } catch {}

  // Clean up orphaned local Docker containers from previous runs
  try {
    const { isLocalExecutionEnabled } = await import('../lib/execution/router.js');
    if (isLocalExecutionEnabled()) {
      console.log('[mantis] step: cleanupOrphanedContainers');
      const { cleanupOrphanedContainers } = await import('../lib/execution/local-runner.js');
      await cleanupOrphanedContainers();
    }
  } catch (err) {
    console.error('[mantis] Orphaned container cleanup failed:', err.message);
  }

  // Initialize warm pool if configured
  try {
    const { isLocalExecutionEnabled: localEnabled, getWarmPoolSize } = await import('../lib/execution/router.js');
    if (localEnabled() && getWarmPoolSize() > 0) {
      console.log('[mantis] step: initWarmPool');
      const { initWarmPool } = await import('../lib/execution/warm-pool.js');
      await initWarmPool();
    }
  } catch (err) {
    console.error('[mantis] Warm pool initialization failed:', err.message);
  }

  // Pre-compile all API routes for instant availability
  console.log('[mantis] step: precompileRoutes');
  try {
    // Warm trigger cache
    const { loadTriggers } = await import('../lib/triggers.js');
    loadTriggers();

    // Pre-import API route handlers to ensure they're compiled
    await import('../api/index.js');
    await import('../lib/chat/api.js');

    console.log('[mantis] ✓ SSE VERIFIED: all routes pre-compiled, this MUST appear instantly');
  } catch (err) {
    console.error('[mantis] Route pre-compilation failed:', err.message);
  }

  // Graceful shutdown — stop warm containers when event handler exits
  const shutdownHandler = async (signal) => {
    console.log(`[mantis] ${signal} received, shutting down...`);
    try {
      const { shutdownWarmPool } = await import('../lib/execution/warm-pool.js');
      await shutdownWarmPool();
    } catch {}
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
  process.on('SIGINT', () => shutdownHandler('SIGINT'));

  console.log('mantis-ai initialized');
}
