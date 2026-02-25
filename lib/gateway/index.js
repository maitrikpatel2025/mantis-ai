import { GatewayServer } from "./server.js";
const DEFAULT_PORT = 18789;
function startGateway() {
  if (globalThis.__mantis_gateway) {
    return globalThis.__mantis_gateway;
  }
  const port = parseInt(process.env.GATEWAY_PORT || "", 10) || DEFAULT_PORT;
  const server = new GatewayServer({ port });
  server.start();
  globalThis.__mantis_gateway = server;
  return server;
}
async function stopGateway() {
  if (globalThis.__mantis_gateway) {
    await globalThis.__mantis_gateway.stop();
    globalThis.__mantis_gateway = void 0;
  }
}
function getGateway() {
  return globalThis.__mantis_gateway || null;
}
export {
  getGateway,
  startGateway,
  stopGateway
};
