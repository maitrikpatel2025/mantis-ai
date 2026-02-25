import { GatewayServer } from './server.js';

declare global {
  // eslint-disable-next-line no-var
  var __mantis_gateway: GatewayServer | undefined;
}

const DEFAULT_PORT = 18789;

/**
 * Start the WebSocket gateway (if not already running).
 * Uses globalThis to survive Turbopack module re-instantiation.
 */
export function startGateway(): GatewayServer {
  if (globalThis.__mantis_gateway) {
    return globalThis.__mantis_gateway;
  }

  const port = parseInt(process.env.GATEWAY_PORT || '', 10) || DEFAULT_PORT;
  const server = new GatewayServer({ port });
  server.start();

  globalThis.__mantis_gateway = server;
  return server;
}

/**
 * Stop the WebSocket gateway.
 */
export async function stopGateway(): Promise<void> {
  if (globalThis.__mantis_gateway) {
    await globalThis.__mantis_gateway.stop();
    globalThis.__mantis_gateway = undefined;
  }
}

/**
 * Get the current gateway instance (or null if not running).
 */
export function getGateway(): GatewayServer | null {
  return globalThis.__mantis_gateway || null;
}
