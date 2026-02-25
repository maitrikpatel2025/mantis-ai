function withMantis(nextConfig = {}) {
  const userWebpack = nextConfig.webpack;
  return {
    ...nextConfig,
    distDir: process.env.NEXT_BUILD_DIR || ".next",
    serverExternalPackages: [
      ...nextConfig.serverExternalPackages || [],
      "better-sqlite3",
      "drizzle-orm"
    ],
    webpack(config, options) {
      if (options.isServer) {
        config.externals = config.externals || [];
        config.externals.push("better-sqlite3", "drizzle-orm", "node-cron");
      }
      return userWebpack ? userWebpack(config, options) : config;
    }
  };
}
export {
  withMantis
};
