import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import WebSocket from 'ws';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock verifyApiKey — default: valid key
vi.mock('../../../lib/db/api-keys.js', () => ({
  verifyApiKey: vi.fn().mockReturnValue({ id: 'test-key', keyPrefix: 'mk_test' }),
}));

// Mock chatStream — returns an async generator yielding two text chunks
vi.mock('../../../lib/ai/index.js', () => ({
  chatStream: vi.fn().mockImplementation(async function* () {
    yield { type: 'text', text: 'Hello ' };
    yield { type: 'text', text: 'world!' };
  }),
}));

const { GatewayServer } = await import('../../../lib/gateway/server.js');
const { verifyApiKey } = await import('../../../lib/db/api-keys.js');
const { chatStream } = await import('../../../lib/ai/index.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pick a random port in the 18900-19900 range to avoid conflicts. */
function randomPort(): number {
  return 18900 + Math.floor(Math.random() * 1000);
}

/** Open a WebSocket connection and resolve once it is open. */
function connectClient(port: number, key: string = 'valid-key'): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}?key=${key}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

/** Connect *without* a key query param. */
function connectWithoutKey(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

/** Receive the next single message from a WebSocket. */
function receiveMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve) => {
    ws.once('message', (data) => resolve(JSON.parse(String(data))));
  });
}

/** Receive exactly `count` messages from a WebSocket. */
function receiveMessages(ws: WebSocket, count: number): Promise<any[]> {
  return new Promise((resolve) => {
    const messages: any[] = [];
    const handler = (data: any) => {
      messages.push(JSON.parse(String(data)));
      if (messages.length >= count) {
        ws.off('message', handler);
        resolve(messages);
      }
    };
    ws.on('message', handler);
  });
}

/** Wait for a WebSocket close event. Returns { code, reason }. */
function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    ws.on('close', (code: number, reason: Buffer) => {
      resolve({ code, reason: reason.toString() });
    });
  });
}

/** Small async delay. */
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GatewayServer', () => {
  let server: InstanceType<typeof GatewayServer>;
  let port: number;
  let clients: WebSocket[];

  beforeEach(() => {
    port = randomPort();
    server = new GatewayServer({ port });
    server.start();
    clients = [];

    // Reset mocks to default behaviour
    (verifyApiKey as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'test-key',
      keyPrefix: 'mk_test',
    });
    (chatStream as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
      yield { type: 'text', text: 'Hello ' };
      yield { type: 'text', text: 'world!' };
    });
  });

  afterEach(async () => {
    // Close any test clients first
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }
    await server.stop();
    // Small grace period for OS to release the port
    await delay(50);
  });

  // -------------------------------------------------------------------------
  // 1. Rejects connection without API key
  // -------------------------------------------------------------------------
  it('rejects connection without API key', async () => {
    // Connect without ?key param — the server sends an error then closes with 4001
    const ws = new WebSocket(`ws://localhost:${port}`);
    clients.push(ws);

    const closePromise = waitForClose(ws);

    // The server sends an error message before closing
    const msg = await receiveMessage(ws);
    expect(msg).toEqual({ type: 'error', error: 'Missing API key. Connect with ?key=YOUR_API_KEY' });

    const { code } = await closePromise;
    expect(code).toBe(4001);
  });

  // -------------------------------------------------------------------------
  // 2. Rejects connection with invalid API key
  // -------------------------------------------------------------------------
  it('rejects connection with invalid API key', async () => {
    (verifyApiKey as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const ws = new WebSocket(`ws://localhost:${port}?key=bad-key`);
    clients.push(ws);

    const closePromise = waitForClose(ws);

    const msg = await receiveMessage(ws);
    expect(msg).toEqual({ type: 'error', error: 'Invalid API key' });

    const { code } = await closePromise;
    expect(code).toBe(4001);
  });

  // -------------------------------------------------------------------------
  // 3. Accepts connection with valid API key
  // -------------------------------------------------------------------------
  it('accepts connection with valid API key', async () => {
    const ws = await connectClient(port);
    clients.push(ws);

    expect(ws.readyState).toBe(WebSocket.OPEN);
    expect(server.connectionCount).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 4. Handles ping/pong
  // -------------------------------------------------------------------------
  it('handles ping/pong', async () => {
    const ws = await connectClient(port);
    clients.push(ws);

    const msgPromise = receiveMessage(ws);
    ws.send(JSON.stringify({ type: 'ping' }));

    const response = await msgPromise;
    expect(response).toEqual({ type: 'pong' });
  });

  // -------------------------------------------------------------------------
  // 5. Handles set-thread
  // -------------------------------------------------------------------------
  it('handles set-thread', async () => {
    const ws = await connectClient(port);
    clients.push(ws);

    ws.send(JSON.stringify({ type: 'set-thread', threadId: 'thread-1' }));

    // Give the server a moment to process
    await delay(50);

    const sessions = server.getSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].threadId).toBe('thread-1');
  });

  // -------------------------------------------------------------------------
  // 6. Streams chat response
  // -------------------------------------------------------------------------
  it('streams chat response', async () => {
    const ws = await connectClient(port);
    clients.push(ws);

    const msgsPromise = receiveMessages(ws, 3);
    ws.send(JSON.stringify({ type: 'chat', text: 'hello' }));

    const messages = await msgsPromise;

    expect(messages).toEqual([
      { type: 'chunk', content: 'Hello ' },
      { type: 'chunk', content: 'world!' },
      { type: 'done' },
    ]);

    expect(chatStream).toHaveBeenCalledWith(
      expect.any(String), // threadId (auto-generated UUID)
      'hello',
      [],
      { userId: 'gateway' },
    );
  });

  // -------------------------------------------------------------------------
  // 7. Returns error for chat without text
  // -------------------------------------------------------------------------
  it('returns error for chat without text', async () => {
    const ws = await connectClient(port);
    clients.push(ws);

    const msgPromise = receiveMessage(ws);
    ws.send(JSON.stringify({ type: 'chat' }));

    const response = await msgPromise;
    expect(response).toEqual({ type: 'error', error: 'Missing text field' });
  });

  // -------------------------------------------------------------------------
  // 8. Handles invalid JSON
  // -------------------------------------------------------------------------
  it('handles invalid JSON', async () => {
    const ws = await connectClient(port);
    clients.push(ws);

    const msgPromise = receiveMessage(ws);
    ws.send('not json');

    const response = await msgPromise;
    expect(response).toEqual({ type: 'error', error: 'Invalid JSON' });
  });

  // -------------------------------------------------------------------------
  // 9. Returns error for unknown message type
  // -------------------------------------------------------------------------
  it('returns error for unknown message type', async () => {
    const ws = await connectClient(port);
    clients.push(ws);

    const msgPromise = receiveMessage(ws);
    ws.send(JSON.stringify({ type: 'unknown' }));

    const response = await msgPromise;
    expect(response).toEqual({ type: 'error', error: 'Unknown message type: unknown' });
  });

  // -------------------------------------------------------------------------
  // 10. Tracks session count across connects and disconnects
  // -------------------------------------------------------------------------
  it('tracks session count', async () => {
    const ws1 = await connectClient(port);
    const ws2 = await connectClient(port);
    clients.push(ws1, ws2);

    expect(server.connectionCount).toBe(2);

    // Close one client and wait for the server to process the disconnect
    const closePromise = new Promise<void>((resolve) => {
      ws1.on('close', () => resolve());
    });
    ws1.close();
    await closePromise;
    await delay(50);

    expect(server.connectionCount).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 11. stop() notifies clients with shutdown message and closes
  // -------------------------------------------------------------------------
  it('stop() notifies clients', async () => {
    const ws = await connectClient(port);
    clients.push(ws);

    const msgPromise = receiveMessage(ws);
    const closePromise = waitForClose(ws);

    await server.stop();

    const msg = await msgPromise;
    expect(msg).toEqual({ type: 'shutdown' });

    const { code } = await closePromise;
    expect(code).toBe(1001);
  });

  // -------------------------------------------------------------------------
  // Extra: getSessions returns correct shape
  // -------------------------------------------------------------------------
  it('getSessions returns session info without ws reference', async () => {
    const ws = await connectClient(port);
    clients.push(ws);

    const sessions = server.getSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual(
      expect.objectContaining({
        sessionId: expect.any(String),
        connectedAt: expect.any(Number),
      }),
    );
    // The returned object must NOT leak the internal ws reference
    expect(sessions[0]).not.toHaveProperty('ws');
  });

  // -------------------------------------------------------------------------
  // Extra: chat uses threadId from set-thread
  // -------------------------------------------------------------------------
  it('chat uses threadId set via set-thread', async () => {
    const ws = await connectClient(port);
    clients.push(ws);

    ws.send(JSON.stringify({ type: 'set-thread', threadId: 'my-thread' }));
    await delay(50);

    const msgsPromise = receiveMessages(ws, 3);
    ws.send(JSON.stringify({ type: 'chat', text: 'hi' }));
    await msgsPromise;

    expect(chatStream).toHaveBeenCalledWith(
      'my-thread',
      'hi',
      [],
      { userId: 'gateway' },
    );
  });

  // -------------------------------------------------------------------------
  // Extra: start() is idempotent
  // -------------------------------------------------------------------------
  it('start() is idempotent', () => {
    // server.start() was already called in beforeEach — calling again should not throw
    expect(() => server.start()).not.toThrow();
  });
});
