import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { getAgent } from "./agent.js";
import { createModel } from "./model.js";
import { jobSummaryMd } from "../paths.js";
import { render_md } from "../utils/render-md.js";
import { getChatById, createChat, saveMessage, updateChatTitle } from "../db/chats.js";
import { toolRegistry } from "./tools.js";
import { createUsageTracker } from "./usage-callback.js";
function persistMessage(threadId, role, text, options = {}) {
  try {
    if (!getChatById(threadId)) {
      createChat(options.userId || "unknown", options.chatTitle || "New Chat", threadId);
    }
    saveMessage(threadId, role, text);
  } catch (err) {
    console.error("Failed to persist message:", err);
  }
}
async function chat(threadId, message, attachments = [], options = {}) {
  const agent = await getAgent(options.model);
  persistMessage(threadId, "user", message || "[attachment]", options);
  const content = [];
  if (message) {
    content.push({ type: "text", text: message });
  }
  for (const att of attachments) {
    if (att.category === "image") {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${att.mimeType};base64,${att.data.toString("base64")}`
        }
      });
    }
  }
  const messageContent = content.length === 1 && content[0].type === "text" ? content[0].text : content;
  const usageTracker = createUsageTracker("chat", threadId);
  const result = await agent.invoke(
    { messages: [new HumanMessage({ content: messageContent })] },
    { configurable: { thread_id: threadId }, callbacks: [usageTracker] }
  );
  const lastMessage = result.messages[result.messages.length - 1];
  let response;
  if (typeof lastMessage.content === "string") {
    response = lastMessage.content;
  } else {
    response = lastMessage.content.filter((block) => block.type === "text").map((block) => block.text || "").join("\n");
  }
  persistMessage(threadId, "assistant", response, options);
  if (options.userId && message) {
    autoTitle(threadId, message).catch(() => {
    });
  }
  return response;
}
async function* chatStream(threadId, message, attachments = [], options = {}) {
  const agent = await getAgent(options.model);
  if (!options.skipUserPersist) {
    persistMessage(threadId, "user", message || "[attachment]", options);
  }
  const content = [];
  if (message) {
    content.push({ type: "text", text: message });
  }
  for (const att of attachments) {
    if (att.category === "image") {
      const url = att.dataUrl ? att.dataUrl : `data:${att.mimeType};base64,${att.data.toString("base64")}`;
      content.push({
        type: "image_url",
        image_url: { url }
      });
    }
  }
  const messageContent = content.length === 1 && content[0].type === "text" ? content[0].text : content;
  try {
    const usageTracker = createUsageTracker("chat", threadId);
    const stream = await agent.stream(
      { messages: [new HumanMessage({ content: messageContent })] },
      { configurable: { thread_id: threadId }, streamMode: "messages", callbacks: [usageTracker] }
    );
    let fullText = "";
    for await (const event of stream) {
      const msg = Array.isArray(event) ? event[0] : event;
      const msgType = msg._getType?.();
      if (msgType === "ai") {
        if (msg.tool_calls?.length > 0) {
          for (const tc of msg.tool_calls) {
            yield {
              type: "tool-call",
              toolCallId: tc.id,
              toolName: tc.name,
              args: tc.args
            };
          }
        }
        let text = "";
        if (typeof msg.content === "string") {
          text = msg.content;
        } else if (Array.isArray(msg.content)) {
          text = msg.content.filter((b) => b.type === "text" && b.text).map((b) => b.text).join("");
        }
        if (text) {
          fullText += text;
          yield { type: "text", text };
        }
      } else if (msgType === "tool") {
        yield {
          type: "tool-result",
          toolCallId: msg.tool_call_id,
          result: msg.content
        };
      }
    }
    if (fullText) {
      persistMessage(threadId, "assistant", fullText, options);
    }
    if (options.userId && message) {
      autoTitle(threadId, message).catch(() => {
      });
    }
  } catch (err) {
    console.error("[chatStream] error:", err);
    throw err;
  }
}
async function chatWithAgent(agentName, threadId, message, attachments = [], options = {}) {
  const { getSubAgent } = await import("./sub-agents.js");
  const agent = await getSubAgent(agentName, toolRegistry);
  persistMessage(threadId, "user", message || "[attachment]", options);
  const content = [];
  if (message) {
    content.push({ type: "text", text: message });
  }
  for (const att of attachments) {
    if (att.category === "image") {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${att.mimeType};base64,${att.data.toString("base64")}`
        }
      });
    }
  }
  const messageContent = content.length === 1 && content[0].type === "text" ? content[0].text : content;
  const usageTracker = createUsageTracker("chat", threadId);
  const result = await agent.invoke(
    { messages: [new HumanMessage({ content: messageContent })] },
    { configurable: { thread_id: threadId }, callbacks: [usageTracker] }
  );
  const lastMessage = result.messages[result.messages.length - 1];
  let response;
  if (typeof lastMessage.content === "string") {
    response = lastMessage.content;
  } else {
    response = lastMessage.content.filter((block) => block.type === "text").map((block) => block.text || "").join("\n");
  }
  persistMessage(threadId, "assistant", response, options);
  if (options.userId && message) {
    autoTitle(threadId, message).catch(() => {
    });
  }
  return response;
}
async function autoTitle(threadId, firstMessage) {
  try {
    const chatRecord = getChatById(threadId);
    if (!chatRecord || chatRecord.title !== "New Chat") return;
    const model = await createModel({ maxTokens: 250 });
    const response = await model.invoke([
      ["system", "Generate a short (3-6 word) title for this chat based on the user's first message. Return ONLY the title, nothing else."],
      ["human", firstMessage]
    ]);
    const title = typeof response.content === "string" ? response.content : response.content.filter((b) => b.type === "text").map((b) => b.text || "").join("");
    const cleaned = title.replace(/^["']+|["']+$/g, "").trim();
    if (cleaned) {
      updateChatTitle(threadId, cleaned);
    }
  } catch (err) {
    console.error("[autoTitle] Failed to generate title:", err.message);
  }
}
async function summarizeJob(results) {
  try {
    const model = await createModel({ maxTokens: 1024 });
    const systemPrompt = render_md(jobSummaryMd);
    const userMessage = [
      results.job ? `## Task
${results.job}` : "",
      results.commit_message ? `## Commit Message
${results.commit_message}` : "",
      results.changed_files?.length ? `## Changed Files
${results.changed_files.join("\n")}` : "",
      results.status ? `## Status
${results.status}` : "",
      results.merge_result ? `## Merge Result
${results.merge_result}` : "",
      results.pr_url ? `## PR URL
${results.pr_url}` : "",
      results.run_url ? `## Run URL
${results.run_url}` : "",
      results.log ? `## Agent Log
${results.log}` : ""
    ].filter(Boolean).join("\n\n");
    const usageTracker = createUsageTracker("summary");
    const response = await model.invoke([
      ["system", systemPrompt],
      ["human", userMessage]
    ], { callbacks: [usageTracker] });
    const text = typeof response.content === "string" ? response.content : response.content.filter((block) => block.type === "text").map((block) => block.text || "").join("\n");
    return text.trim() || "Job finished.";
  } catch (err) {
    console.error("Failed to summarize job:", err);
    return "Job finished.";
  }
}
async function addToThread(threadId, text) {
  try {
    const agent = await getAgent();
    await agent.updateState(
      { configurable: { thread_id: threadId } },
      { messages: [new AIMessage(text)] }
    );
  } catch (err) {
    console.error("Failed to add message to thread:", err);
  }
}
export {
  addToThread,
  chat,
  chatStream,
  chatWithAgent,
  persistMessage,
  summarizeJob
};
