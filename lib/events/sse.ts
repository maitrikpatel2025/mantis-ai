import { auth } from '../auth/index.js';
import { getEventBus } from './bus.js';
import type { DomainEvent } from '../types.js';

/**
 * GET handler for /stream/events — SSE stream with session auth.
 * Pushes all domain events (jobs, notifications, logs, approvals) to the browser.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const bus = getEventBus();

  const stream = new ReadableStream({
    start(controller: ReadableStreamDefaultController) {
      const encoder = new TextEncoder();
      const send = (str: string): void => {
        try { controller.enqueue(encoder.encode(str)); } catch {}
      };

      // Heartbeat every 30s to keep the connection alive through proxies
      const heartbeat = setInterval(() => send(': heartbeat\n\n'), 30000);

      // Throttle log events — buffer and flush at most once per second
      let logBuffer: DomainEvent[] = [];
      let logFlushTimer: ReturnType<typeof setTimeout> | null = null;

      const flushLogs = (): void => {
        if (logBuffer.length === 0) return;
        for (const event of logBuffer) {
          send(`data: ${JSON.stringify(event)}\n\n`);
        }
        logBuffer = [];
        logFlushTimer = null;
      };

      const handler = (event: DomainEvent): void => {
        if (event.type === 'log') {
          logBuffer.push(event);
          if (!logFlushTimer) {
            logFlushTimer = setTimeout(flushLogs, 1000);
          }
        } else {
          send(`data: ${JSON.stringify(event)}\n\n`);
        }
      };

      bus.on('event', handler);

      // Cleanup on client disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        if (logFlushTimer) clearTimeout(logFlushTimer);
        bus.off('event', handler);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
