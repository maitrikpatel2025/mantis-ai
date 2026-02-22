/**
 * Next.js config wrapper for Mantis AI.
 * Enables instrumentation hook for cron scheduling on server start.
 *
 * Usage in user's next.config.mjs:
 *   import { withMantis } from 'mantis-ai/config';
 *   export default withMantis({});
 *
 * @param {Object} nextConfig - User's Next.js config
 * @returns {Object} Enhanced Next.js config
 */
export function withMantis(nextConfig = {}) {
  return {
    ...nextConfig,
    distDir: process.env.NEXT_BUILD_DIR || '.next',
    serverExternalPackages: [
      ...(nextConfig.serverExternalPackages || []),
      'better-sqlite3',
      'drizzle-orm',
    ],
  };
}
