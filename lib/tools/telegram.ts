import { Bot } from 'grammy';
import parseModePlugin from '@grammyjs/parse-mode';
const { hydrateReply } = parseModePlugin as Record<string, unknown>;

const MAX_LENGTH = 4096;

/**
 * Convert markdown to Telegram-compatible HTML.
 * Handles: code blocks, inline code, links, bold, italic, strikethrough, headings, lists.
 * Strips unsupported HTML tags.
 */
function markdownToTelegramHtml(text: string): string {
  if (!text) return '';

  const placeholders: string[] = [];
  function placeholder(content: string): string {
    const id = `\x00PH${placeholders.length}\x00`;
    placeholders.push(content);
    return id;
  }

  // 1. Protect existing supported HTML tags (so they survive escaping)
  text = text.replace(/<(\/?(b|i|s|u|code|pre|a)\b[^>]*)>/g, (match: string) => {
    return placeholder(match);
  });

  // 2. Extract fenced code blocks (``` ... ```)
  text = text.replace(/```[\w]*\n([\s\S]*?)```/g, (_: string, code: string) => {
    return placeholder(`<pre>${escapeHtml(code.replace(/\n$/, ''))}</pre>`);
  });

  // 3. Extract inline code (` ... `)
  text = text.replace(/`([^`\n]+)`/g, (_: string, code: string) => {
    return placeholder(`<code>${escapeHtml(code)}</code>`);
  });

  // 4. Escape remaining HTML special chars (after code + existing tags are protected)
  text = text.replace(/&/g, '&amp;');
  text = text.replace(/</g, '&lt;');
  text = text.replace(/>/g, '&gt;');

  // 5. Links: [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // 6. Bold: **text** or __text__
  text = text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  text = text.replace(/__(.+?)__/g, '<b>$1</b>');

  // 7. Italic: *text* or _text_ (but not inside words for underscores)
  text = text.replace(/(?<!\w)\*([^*\n<]+)\*(?!\w)/g, '<i>$1</i>');
  text = text.replace(/(?<!\w)_([^_\n<]+)_(?!\w)/g, '<i>$1</i>');

  // 8. Strikethrough: ~~text~~
  text = text.replace(/~~(.+?)~~/g, '<s>$1</s>');

  // 9. Headings: ## text -> bold (must be at line start)
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');

  // 10. List items: - item or * item -> bullet
  text = text.replace(/^[\s]*[-*]\s+/gm, '\u2022 ');

  // 11. Numbered list items: 1. item -> keep as-is (already plain text friendly)

  // 12. Restore placeholders
  for (let i = 0; i < placeholders.length; i++) {
    text = text.replace(`\x00PH${i}\x00`, placeholders[i]);
  }

  return text;
}

let bot: Bot | null = null;
let currentToken: string | null = null;

/**
 * Get or create bot instance
 */
function getBot(token: string): Bot {
  if (!bot || currentToken !== token) {
    bot = new Bot(token);
    if (hydrateReply) bot.use(hydrateReply as Parameters<typeof bot.use>[0]);
    currentToken = token;
  }
  return bot;
}

/**
 * Set webhook for a Telegram bot
 */
async function setWebhook(botToken: string, webhookUrl: string, secretToken?: string): Promise<boolean> {
  const b = getBot(botToken);
  const options: Record<string, unknown> = {};
  if (secretToken) {
    options.secret_token = secretToken;
  }
  return b.api.setWebhook(webhookUrl, options);
}

/**
 * Smart split text into chunks that fit Telegram's limit
 * Prefers splitting at paragraph > newline > sentence > space
 */
function smartSplit(text: string, maxLength: number = MAX_LENGTH): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    const chunk = remaining.slice(0, maxLength);
    let splitAt = -1;

    // Try to split at natural boundaries (prefer earlier ones)
    for (const delim of ['\n\n', '\n', '. ', ' ']) {
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

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

interface SendMessageOptions {
  disablePreview?: boolean;
}

/**
 * Send a message to a Telegram chat with HTML formatting
 * Automatically splits long messages
 */
async function sendMessage(
  botToken: string,
  chatId: number | string,
  text: string,
  options: SendMessageOptions = {}
): Promise<Record<string, unknown>> {
  const b = getBot(botToken);
  text = markdownToTelegramHtml(text);
  // Strip HTML comments — Telegram's HTML parser doesn't support them
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  const chunks = smartSplit(text, MAX_LENGTH);

  let lastMessage: Record<string, unknown> | undefined;
  for (const chunk of chunks) {
    lastMessage = await b.api.sendMessage(chatId, chunk, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: options.disablePreview ?? false },
    }) as unknown as Record<string, unknown>;
  }

  return lastMessage!;
}

/**
 * Edit an existing message's text in a Telegram chat.
 * Used for streaming (edit-in-place) delivery.
 */
async function editMessageText(
  botToken: string,
  chatId: number | string,
  messageId: number,
  text: string
): Promise<void> {
  const b = getBot(botToken);
  text = markdownToTelegramHtml(text);
  // Strip HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  // Truncate to Telegram's limit
  if (text.length > MAX_LENGTH) {
    text = text.slice(0, MAX_LENGTH - 3) + '...';
  }
  await b.api.editMessageText(chatId, messageId, text, {
    parse_mode: 'HTML',
  });
}

interface JobNotificationParams {
  jobId: string;
  success: boolean;
  summary: string;
  prUrl: string;
}

/**
 * Format a job notification message
 */
function formatJobNotification({ jobId, success, summary, prUrl }: JobNotificationParams): string {
  const emoji = success ? '\u2705' : '\u26a0\ufe0f';
  const status = success ? 'complete' : 'had issues';
  const shortId = jobId.slice(0, 8);

  return `${emoji} <b>Job ${shortId}</b> ${status}

${escapeHtml(summary)}

<a href="${prUrl}">View PR</a>`;
}

interface DownloadedFile {
  buffer: Buffer;
  filename: string;
}

/**
 * Download a file from Telegram servers
 */
async function downloadFile(botToken: string, fileId: string): Promise<DownloadedFile> {
  // Get file path from Telegram
  const fileInfoRes = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
  );
  const fileInfo = await fileInfoRes.json() as { ok: boolean; description?: string; result: { file_path: string } };
  if (!fileInfo.ok) {
    throw new Error(`Telegram API error: ${fileInfo.description}`);
  }

  const filePath = fileInfo.result.file_path;

  // Download file
  const fileRes = await fetch(
    `https://api.telegram.org/file/bot${botToken}/${filePath}`
  );
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  const filename = filePath.split('/').pop()!;

  return { buffer, filename };
}

/**
 * React to a message with an emoji
 */
async function reactToMessage(
  botToken: string,
  chatId: number | string,
  messageId: number,
  emoji: string = '\ud83d\udc4d'
): Promise<void> {
  const b = getBot(botToken);
  await b.api.setMessageReaction(chatId, messageId, [{ type: 'emoji', emoji }] as unknown as Parameters<typeof b.api.setMessageReaction>[2]);
}

/**
 * Start a repeating typing indicator for a chat.
 * Returns a stop function. The indicator naturally expires after 5s,
 * so we re-send with random gaps (5.5-8s) to look human.
 */
function startTypingIndicator(botToken: string, chatId: number | string): () => void {
  const b = getBot(botToken);
  let timeout: ReturnType<typeof setTimeout>;
  let stopped = false;

  function scheduleNext(): void {
    if (stopped) return;
    const delay = 5500 + Math.random() * 2500;
    timeout = setTimeout(() => {
      if (stopped) return;
      b.api.sendChatAction(chatId, 'typing').catch(() => {});
      scheduleNext();
    }, delay);
  }

  b.api.sendChatAction(chatId, 'typing').catch(() => {});
  scheduleNext();

  return () => {
    stopped = true;
    clearTimeout(timeout);
  };
}

export {
  getBot,
  setWebhook,
  sendMessage,
  editMessageText,
  smartSplit,
  escapeHtml,
  markdownToTelegramHtml,
  formatJobNotification,
  downloadFile,
  reactToMessage,
  startTypingIndicator,
};
