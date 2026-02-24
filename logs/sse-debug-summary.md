# SSE Debug Summary

**Job:** DEBUG SSE: checking if events reach the browser  
**Date:** 2026-02-24  
**Status:** ✅ Complete

## What Was Created

A comprehensive debugging toolkit for Server-Sent Events (SSE) in the Mantis AI chat streaming system.

## Files Created

### 1. Debug Server API (`tmp/debug-chat-api.js`)
Enhanced version of `lib/chat/api.js` with extensive logging:
- Logs every request parameter
- Logs authentication status
- Logs message extraction and parsing
- Logs every chunk from the chatStream generator
- Logs every writer.write call to the SSE stream
- Logs stream completion/errors

**Key features:**
- Timestamps on all logs
- Visual separators for request/response lifecycle
- Content previews for debugging
- Error tracking with full stack traces

### 2. Debug Client Component (`tmp/debug-chat-client.jsx`)
React component with dual interfaces:
- **Left panel:** Full chat interface using AI SDK's useChat hook
- **Right panel:** Real-time log viewer showing all client-side events

**Key features:**
- Logs all useChat state changes (status, messages, errors)
- Shows message parts structure
- Includes "Test Raw Stream" button that bypasses AI SDK entirely
- Raw stream test reads fetch response directly to isolate SSE from AI SDK

### 3. Setup Script (`tmp/setup-debug.sh`)
Automated installation of debug toolkit:
- Auto-detects package dev vs user project
- Backs up original files
- Installs debug API
- Creates debug page at `/debug`
- Provides next steps guidance

### 4. Cleanup Script (`tmp/cleanup-debug.sh`)
Restores original state:
- Restores backed up files
- Removes debug page
- Leaves no trace

### 5. Standalone Test Page (`tmp/test-sse-standalone.html`)
Pure HTML/JS test page that can be opened in any browser:
- No framework dependencies
- Direct fetch to `/stream/chat`
- Manual SSE parsing
- Real-time metrics (event count, duration, status)
- Color-coded event log
- Perfect for isolating SSE from all framework abstractions

### 6. Comprehensive Guide (`tmp/README-DEBUG-SSE.md`)
Complete debugging documentation covering:
- Setup instructions (manual and automated)
- What to check at each layer
- Common issues and solutions
- Interpretation guide for logs
- Cleanup procedures
- Next steps based on findings

## How to Use

### Quick Start

```bash
# 1. Install debug toolkit
bash tmp/setup-debug.sh

# 2. Start dev server
npm run dev

# 3. Open debug page
# http://localhost:3000/debug

# 4. Send a message and observe:
#    - Server console
#    - Browser console
#    - Browser DevTools Network tab
#    - Click "Test Raw Stream" button

# 5. For standalone test (no framework):
# http://localhost:3000/tmp/test-sse-standalone.html
```

### What to Look For

#### Server Console ✓
```
========== SSE DEBUG: Request received ==========
Auth check: PASSED
✓ Stream execute started
→ Chunk 1: text
→ Writing: { type: "text-delta", ... }
✓ Stream execute completed successfully
```

#### Browser Console ✓
```
[19:30:00] Status changed: loading
[19:30:01] Messages updated: count=2
[19:30:01]   Part 0: type=text
```

#### Network Tab ✓
- Status: `200 OK`
- Content-Type: `text/event-stream`
- Connection stays open during streaming
- EventStream tab shows events

#### Raw SSE Test ✓
```
Response received: status=200
✓ Response body exists, creating reader
Event 1: data:{"type":"start",...}
Event 2: data:{"type":"text-delta",...}
✓ Stream complete (received 15 events)
```

## Debug Workflow

1. **Start with standalone test** → Confirms SSE works at HTTP level
2. **Check server logs** → Confirms chunks are being generated
3. **Check raw SSE test** → Confirms events reach browser
4. **Check useChat integration** → Confirms AI SDK parsing works

This progressive isolation helps identify exactly where issues occur.

## Common Findings

### Issue: Events Not Reaching Browser

**Likely causes:**
- Reverse proxy buffering (Nginx, Cloudflare, Traefik)
- Middleware modifying responses
- CORS issues (if testing from different origin)

**Solution:**
- Disable proxy buffering for SSE endpoints
- Check middleware doesn't modify streaming responses
- Test directly on localhost without proxy

### Issue: Events Reach Browser But UI Doesn't Update

**Likely causes:**
- AI SDK version mismatch
- Event format doesn't match AI SDK expectations
- React state update issues

**Solution:**
- Check AI SDK version (should be ^4.1.0 for createUIMessageStream)
- Compare writer.write payloads with AI SDK docs
- Check React console for rendering errors

### Issue: Stream Closes Immediately

**Likely causes:**
- Generator not async (must be async function*)
- Error in stream executor
- Response headers not set correctly

**Solution:**
- Verify chatStream is async generator
- Check try/catch in execute function
- Verify Content-Type header is set by AI SDK

## Architecture Notes

The streaming pipeline has 4 layers:

```
┌─────────────────────────────────────┐
│  LangGraph Agent                    │  Generates messages
│  (lib/ai/index.js: chatStream)      │  via async generator
└──────────────┬──────────────────────┘
               │ yields { type, ...chunks }
               ▼
┌─────────────────────────────────────┐
│  Chat API Route Handler             │  Wraps chunks in
│  (lib/chat/api.js: POST)            │  AI SDK stream
└──────────────┬──────────────────────┘
               │ writer.write({ type, ... })
               ▼
┌─────────────────────────────────────┐
│  AI SDK Stream Encoder              │  Formats as SSE
│  (createUIMessageStream)            │  text/event-stream
└──────────────┬──────────────────────┘
               │ data: {...}\n\n
               ▼
┌─────────────────────────────────────┐
│  Browser (fetch/EventSource)        │  Parses events
│  useChat hook or raw fetch          │  and updates UI
└─────────────────────────────────────┘
```

Each layer can be debugged independently:
- Layer 1: Check chatStream yields chunks (server logs)
- Layer 2: Check writer.write calls (server logs)
- Layer 3: Check SSE format (raw test, Network tab)
- Layer 4: Check UI updates (browser console, React DevTools)

## Technical Details

### SSE Event Format

AI SDK uses this format:
```
data: {"type":"text-start","id":"abc123"}

data: {"type":"text-delta","id":"abc123","delta":"Hello"}

data: {"type":"text-end","id":"abc123"}

data: {"type":"finish"}

```

Each event is:
- Prefixed with `data: `
- JSON payload
- Followed by double newline `\n\n`

### Message Parts Structure

AI SDK v5+ uses a parts-based message format:
```javascript
{
  id: 'msg-123',
  role: 'assistant',
  parts: [
    { type: 'text', text: 'Hello' },
    { type: 'tool-call', toolCallId: 'tc1', toolName: 'create_job', state: 'input-available', input: {...} },
    { type: 'tool-call', toolCallId: 'tc1', toolName: 'create_job', state: 'output-available', output: {...} },
  ]
}
```

The debug tools help visualize this structure.

## Next Steps

After running the debug tools, you should be able to:

1. **Confirm SSE works** → All 4 layers functioning correctly
2. **Identify bottleneck** → Specific layer causing issues
3. **Apply targeted fix** → Address root cause directly

If SSE is working but you have other issues:
- **Slow responses:** Check LLM API latency, model selection
- **Incomplete messages:** Check token limits, streaming chunks
- **Tool execution:** Check tool function implementations

## Cleanup

When done debugging:
```bash
bash tmp/cleanup-debug.sh
```

This restores all original files.

## Files Reference

```
tmp/
├── debug-chat-api.js          # Enhanced server API with logging
├── debug-chat-client.jsx      # React component with dual interface
├── test-sse-standalone.html   # Pure HTML/JS test page
├── setup-debug.sh             # Automated installation script
├── cleanup-debug.sh           # Restore original state
├── README-DEBUG-SSE.md        # Complete debugging guide
└── debug-sse-plan.md          # Architecture overview
```

## Support

If issues persist after using these tools:
1. Share server console logs
2. Share browser console logs  
3. Share Network tab screenshot
4. Share raw SSE test results

This will help identify the exact layer where issues occur.
