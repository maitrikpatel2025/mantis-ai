import { Bot } from "grammy";
import parseModePlugin from "@grammyjs/parse-mode";
const { hydrateReply } = parseModePlugin;
const MAX_LENGTH = 4096;
function markdownToTelegramHtml(text) {
  if (!text) return "";
  const placeholders = [];
  function placeholder(content) {
    const id = `\0PH${placeholders.length}\0`;
    placeholders.push(content);
    return id;
  }
  text = text.replace(/<(\/?(b|i|s|u|code|pre|a)\b[^>]*)>/g, (match) => {
    return placeholder(match);
  });
  text = text.replace(/```[\w]*\n([\s\S]*?)```/g, (_, code) => {
    return placeholder(`<pre>${escapeHtml(code.replace(/\n$/, ""))}</pre>`);
  });
  text = text.replace(/`([^`\n]+)`/g, (_, code) => {
    return placeholder(`<code>${escapeHtml(code)}</code>`);
  });
  text = text.replace(/&/g, "&amp;");
  text = text.replace(/</g, "&lt;");
  text = text.replace(/>/g, "&gt;");
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  text = text.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  text = text.replace(/__(.+?)__/g, "<b>$1</b>");
  text = text.replace(/(?<!\w)\*([^*\n<]+)\*(?!\w)/g, "<i>$1</i>");
  text = text.replace(/(?<!\w)_([^_\n<]+)_(?!\w)/g, "<i>$1</i>");
  text = text.replace(/~~(.+?)~~/g, "<s>$1</s>");
  text = text.replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>");
  text = text.replace(/^[\s]*[-*]\s+/gm, "\u2022 ");
  for (let i = 0; i < placeholders.length; i++) {
    text = text.replace(`\0PH${i}\0`, placeholders[i]);
  }
  return text;
}
let bot = null;
let currentToken = null;
function getBot(token) {
  if (!bot || currentToken !== token) {
    bot = new Bot(token);
    if (hydrateReply) bot.use(hydrateReply);
    currentToken = token;
  }
  return bot;
}
async function setWebhook(botToken, webhookUrl, secretToken) {
  const b = getBot(botToken);
  const options = {};
  if (secretToken) {
    options.secret_token = secretToken;
  }
  return b.api.setWebhook(webhookUrl, options);
}
function smartSplit(text, maxLength = MAX_LENGTH) {
  if (text.length <= maxLength) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    const chunk = remaining.slice(0, maxLength);
    let splitAt = -1;
    for (const delim of ["\n\n", "\n", ". ", " "]) {
      const idx = chunk.lastIndexOf(delim);
      if (idx > maxLength * 0.3) {
        splitAt = idx + delim.length;
        break;
      }
    }
    if (splitAt === -1) splitAt = maxLength;
    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }
  return chunks;
}
function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
async function sendMessage(botToken, chatId, text, options = {}) {
  const b = getBot(botToken);
  text = markdownToTelegramHtml(text);
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  const chunks = smartSplit(text, MAX_LENGTH);
  let lastMessage;
  for (const chunk of chunks) {
    lastMessage = await b.api.sendMessage(chatId, chunk, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: options.disablePreview ?? false }
    });
  }
  return lastMessage;
}
async function editMessageText(botToken, chatId, messageId, text) {
  const b = getBot(botToken);
  text = markdownToTelegramHtml(text);
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  if (text.length > MAX_LENGTH) {
    text = text.slice(0, MAX_LENGTH - 3) + "...";
  }
  await b.api.editMessageText(chatId, messageId, text, {
    parse_mode: "HTML"
  });
}
function formatJobNotification({ jobId, success, summary, prUrl }) {
  const emoji = success ? "\u2705" : "\u26A0\uFE0F";
  const status = success ? "complete" : "had issues";
  const shortId = jobId.slice(0, 8);
  return `${emoji} <b>Job ${shortId}</b> ${status}

${escapeHtml(summary)}

<a href="${prUrl}">View PR</a>`;
}
async function downloadFile(botToken, fileId) {
  const fileInfoRes = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
  );
  const fileInfo = await fileInfoRes.json();
  if (!fileInfo.ok) {
    throw new Error(`Telegram API error: ${fileInfo.description}`);
  }
  const filePath = fileInfo.result.file_path;
  const fileRes = await fetch(
    `https://api.telegram.org/file/bot${botToken}/${filePath}`
  );
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  const filename = filePath.split("/").pop();
  return { buffer, filename };
}
async function reactToMessage(botToken, chatId, messageId, emoji = "\u{1F44D}") {
  const b = getBot(botToken);
  await b.api.setMessageReaction(chatId, messageId, [{ type: "emoji", emoji }]);
}
function startTypingIndicator(botToken, chatId) {
  const b = getBot(botToken);
  let timeout;
  let stopped = false;
  function scheduleNext() {
    if (stopped) return;
    const delay = 5500 + Math.random() * 2500;
    timeout = setTimeout(() => {
      if (stopped) return;
      b.api.sendChatAction(chatId, "typing").catch(() => {
      });
      scheduleNext();
    }, delay);
  }
  b.api.sendChatAction(chatId, "typing").catch(() => {
  });
  scheduleNext();
  return () => {
    stopped = true;
    clearTimeout(timeout);
  };
}
export {
  downloadFile,
  editMessageText,
  escapeHtml,
  formatJobNotification,
  getBot,
  markdownToTelegramHtml,
  reactToMessage,
  sendMessage,
  setWebhook,
  smartSplit,
  startTypingIndicator
};
