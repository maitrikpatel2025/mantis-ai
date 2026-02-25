import { auth } from "../auth/index.js";
import { getEventBus } from "./bus.js";
async function GET(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const bus = getEventBus();
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (str) => {
        try {
          controller.enqueue(encoder.encode(str));
        } catch {
        }
      };
      const heartbeat = setInterval(() => send(": heartbeat\n\n"), 3e4);
      let logBuffer = [];
      let logFlushTimer = null;
      const flushLogs = () => {
        if (logBuffer.length === 0) return;
        for (const event of logBuffer) {
          send(`data: ${JSON.stringify(event)}

`);
        }
        logBuffer = [];
        logFlushTimer = null;
      };
      const handler = (event) => {
        if (event.type === "log") {
          logBuffer.push(event);
          if (!logFlushTimer) {
            logFlushTimer = setTimeout(flushLogs, 1e3);
          }
        } else {
          send(`data: ${JSON.stringify(event)}

`);
        }
      };
      bus.on("event", handler);
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        if (logFlushTimer) clearTimeout(logFlushTimer);
        bus.off("event", handler);
        try {
          controller.close();
        } catch {
        }
      });
    }
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive"
    }
  });
}
export {
  GET
};
