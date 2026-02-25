/**
 * Next.js config wrapper for Mantis AI.
 * Enables instrumentation hook for cron scheduling on server start.
 *
 * Usage in user's next.config.mjs:
 *   import { withMantis } from 'mantis-ai/config';
 *   export default withMantis({});
 */

interface WebpackConfig {
  externals?: (string | Record<string, string>)[];
  [key: string]: unknown;
}

interface WebpackOptions {
  isServer: boolean;
  [key: string]: unknown;
}

type WebpackFunction = (config: WebpackConfig, options: WebpackOptions) => WebpackConfig;

interface NextConfig {
  distDir?: string;
  serverExternalPackages?: string[];
  webpack?: WebpackFunction;
  [key: string]: unknown;
}

interface MantisNextConfig extends NextConfig {
  distDir: string;
  serverExternalPackages: string[];
  webpack: WebpackFunction;
}

export function withMantis(nextConfig: NextConfig = {}): MantisNextConfig {
  const userWebpack = nextConfig.webpack;

  return {
    ...nextConfig,
    distDir: process.env.NEXT_BUILD_DIR || '.next',
    serverExternalPackages: [
      ...(nextConfig.serverExternalPackages || []),
      'better-sqlite3',
      'drizzle-orm',
    ],
    webpack(config: WebpackConfig, options: WebpackOptions): WebpackConfig {
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
