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
  const userWebpack = nextConfig.webpack;

  return {
    ...nextConfig,
    distDir: process.env.NEXT_BUILD_DIR || '.next',
    serverExternalPackages: [
      ...(nextConfig.serverExternalPackages || []),
      'better-sqlite3',
      'drizzle-orm',
    ],
    webpack(config, options) {
      // serverExternalPackages doesn't apply to the instrumentation bundle,
      // so we must externalize native/fs-dependent packages via webpack config.
      if (options.isServer) {
        config.externals = config.externals || [];
        config.externals.push('better-sqlite3', 'drizzle-orm', 'node-cron');
      }
      return userWebpack ? userWebpack(config, options) : config;
    },
  };
}
