import { auth } from "../auth/index.js";
import { chatStream } from "../ai/index.js";
async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const { messages, chatId: rawChatId, trigger, model } = body;
  if (!messages?.length) {
    return Response.json({ error: "No messages" }, { status: 400 });
  }
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMessage) {
    return Response.json({ error: "No user message" }, { status: 400 });
  }
  let userText = lastUserMessage.parts?.filter((p) => p.type === "text").map((p) => p.text).join("\n") || lastUserMessage.content || "";
  const fileParts = lastUserMessage.parts?.filter((p) => p.type === "file") || [];
  const attachments = [];
  for (const part of fileParts) {
    const { mediaType, url } = part;
    if (!mediaType || !url) continue;
    if (mediaType.startsWith("image/") || mediaType === "application/pdf") {
      attachments.push({ category: "image", mimeType: mediaType, dataUrl: url });
    } else if (mediaType.startsWith("text/") || mediaType === "application/json") {
      try {
        const base64Data = url.split(",")[1];
        const textContent = Buffer.from(base64Data, "base64").toString("utf-8");
        const fileName = part.name || "file";
        userText += `

File: ${fileName}
\`\`\`
${textContent}
\`\`\``;
      } catch (e) {
        console.error("Failed to decode text file:", e);
      }
    }
  }
  if (!userText.trim() && attachments.length === 0) {
    return Response.json({ error: "Empty message" }, { status: 400 });
  }
  const threadId = rawChatId || crypto.randomUUID();
  const { createUIMessageStream, createUIMessageStreamResponse } = await import("ai");
  const stream = createUIMessageStream({
    onError: (error) => {
      console.error("Chat stream error:", error);
      return error?.message || "An error occurred while processing your message.";
    },
    execute: async ({ writer }) => {
      const skipUserPersist = trigger === "regenerate-message";
      const chunks = chatStream(threadId, userText, attachments, {
        userId: session.user.id,
        skipUserPersist,
        model: model || void 0
      });
      writer.write({ type: "start" });
      let textStarted = false;
      let textId = crypto.randomUUID();
      for await (const chunk of chunks) {
        if (chunk.type === "text") {
          if (!textStarted) {
            textId = crypto.randomUUID();
            writer.write({ type: "text-start", id: textId });
            textStarted = true;
          }
          writer.write({ type: "text-delta", id: textId, delta: chunk.text });
        } else if (chunk.type === "tool-call") {
          if (textStarted) {
            writer.write({ type: "text-end", id: textId });
            textStarted = false;
          }
          writer.write({
            type: "tool-input-start",
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName
          });
          writer.write({
            type: "tool-input-available",
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            input: chunk.args
          });
        } else if (chunk.type === "tool-result") {
          writer.write({
            type: "tool-output-available",
            toolCallId: chunk.toolCallId,
            output: chunk.result
          });
        }
      }
      if (textStarted) {
        writer.write({ type: "text-end", id: textId });
      }
      writer.write({ type: "finish" });
    }
  });
  return createUIMessageStreamResponse({ stream });
}
export {
  POST
};
