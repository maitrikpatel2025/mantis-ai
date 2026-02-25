import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import type { GatewaySession, GatewayMessage, GatewayResponse } from '../types.js';

interface GatewayOptions {
  port: number;
}

interface ClientSession extends GatewaySession {
  ws: WebSocket;
}

/**
 * WebSocket gateway server for real-time chat.
 * Authenticates via API key in query param (?key=xxx).
 * Streams chatStream() responses directly to connected clients.
 */
export class GatewayServer {
  private _wss: WebSocketServer | null = null;
  private _sessions: Map<string, ClientSession> = new Map();
  private _port: number;

  constructor(options: GatewayOptions) {
    this._port = options.port;
  }

  /**
   * Start the WebSocket server.
   */
  start(): void {
    if (this._wss) return;

    this._wss = new WebSocketServer({ port: this._port });
    console.log(`[gateway] WebSocket server listening on port ${this._port}`);

    this._wss.on('connection', (ws, req) => {
      this._handleConnection(ws, req).catch((err) => {
        console.error('[gateway] Connection handler error:', err);
        ws.close(1011, 'Internal error');
      });
    });

    this._wss.on('error', (err) => {
      console.error('[gateway] Server error:', err);
    });
  }

  /**
   * Handle a new WebSocket connection.
   */
  private async _handleConnection(ws: WebSocket, req: import('http').IncomingMessage): Promise<void> {
    // Authenticate via query param
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const apiKey = url.searchParams.get('key');

    if (!apiKey) {
      this._send(ws, { type: 'error', error: 'Missing API key. Connect with ?key=YOUR_API_KEY' });
      ws.close(4001, 'Missing API key');
      return;
    }

    let verified: unknown;
    try {
      const { verifyApiKey } = await import('../db/api-keys.js');
      verified = verifyApiKey(apiKey);
    } catch {
      this._send(ws, { type: 'error', error: 'Auth service unavailable' });
      ws.close(4003, 'Auth service unavailable');
      return;
    }

    if (!verified) {
      this._send(ws, { type: 'error', error: 'Invalid API key' });
      ws.close(4001, 'Invalid API key');
      return;
    }

    // Create session
    const sessionId = randomUUID();
    const session: ClientSession = {
      sessionId,
      connectedAt: Date.now(),
      ws,
    };
    this._sessions.set(sessionId, session);
    console.log(`[gateway] Client connected: ${sessionId}`);

    ws.on('message', (data) => {
      this._handleMessage(session, data).catch((err) => {
        console.error(`[gateway] Message handler error (${sessionId}):`, err);
        this._send(ws, { type: 'error', error: 'Internal error' });
      });
    });

    ws.on('close', () => {
      this._sessions.delete(sessionId);
      console.log(`[gateway] Client disconnected: ${sessionId}`);
    });

    ws.on('error', (err) => {
      console.error(`[gateway] Client error (${sessionId}):`, err);
      this._sessions.delete(sessionId);
    });
  }

  /**
   * Handle an incoming WebSocket message.
   */
  private async _handleMessage(session: ClientSession, raw: unknown): Promise<void> {
    let msg: GatewayMessage;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      this._send(session.ws, { type: 'error', error: 'Invalid JSON' });
      return;
    }

    switch (msg.type) {
      case 'ping':
        this._send(session.ws, { type: 'pong' });
        break;

      case 'set-thread':
        session.threadId = msg.threadId;
        break;

      case 'chat':
        await this._handleChat(session, msg);
        break;

      default:
        this._send(session.ws, { type: 'error', error: `Unknown message type: ${(msg as { type: string }).type}` });
    }
  }

  /**
   * Handle a chat message — stream the response back.
   */
  private async _handleChat(session: ClientSession, msg: GatewayMessage): Promise<void> {
    if (!msg.text) {
      this._send(session.ws, { type: 'error', error: 'Missing text field' });
      return;
    }

    const threadId = msg.threadId || session.threadId || randomUUID();
    session.threadId = threadId;

    try {
      const { chatStream } = await import('../ai/index.js');
      const stream = chatStream(threadId, msg.text, [], { userId: 'gateway' });

      for await (const event of stream) {
        // Only send text chunks to the client
        if (event.type === 'text' && event.text) {
          this._send(session.ws, { type: 'chunk', content: event.text as string });
        }
      }

      this._send(session.ws, { type: 'done' });
    } catch (err) {
      console.error(`[gateway] Chat error (${session.sessionId}):`, err);
      this._send(session.ws, { type: 'error', error: 'Chat processing failed' });
    }
  }

  /**
   * Send a typed message to a WebSocket client.
   */
  private _send(ws: WebSocket, msg: GatewayResponse): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  /**
   * Stop the server and notify connected clients.
   */
  async stop(): Promise<void> {
    if (!this._wss) return;

    // Notify all connected clients
    for (const [, session] of this._sessions) {
      this._send(session.ws, { type: 'shutdown' });
      session.ws.close(1001, 'Server shutting down');
    }
    this._sessions.clear();

    return new Promise<void>((resolve) => {
      this._wss!.close(() => {
        console.log('[gateway] WebSocket server stopped');
        this._wss = null;
        resolve();
      });
    });
  }

  /**
   * Get the number of connected clients.
   */
  get connectionCount(): number {
    return this._sessions.size;
  }

  /**
   * Get session info for all connected clients (for health/debug).
   */
  getSessions(): GatewaySession[] {
    return Array.from(this._sessions.values()).map(({ sessionId, threadId, connectedAt }) => ({
      sessionId,
      threadId,
      connectedAt,
    }));
  }
}
