/**
 * Discord API helpers.
 * Uses Discord REST API directly via fetch (no gateway connection needed).
 */

const DISCORD_API: string = 'https://discord.com/api/v10';

/**
 * Send a message to a Discord channel.
 * Automatically splits messages exceeding 2000 chars.
 * @param botToken - Discord bot token
 * @param channelId - Channel ID
 * @param text - Message content
 */
export async function sendMessage(
  botToken: string,
  channelId: string,
  text: string
): Promise<Record<string, unknown>> {
  const chunks: string[] = smartSplit(text, 2000);
  let lastResult: Record<string, unknown> | undefined;

  for (const chunk of chunks) {
    const res: Response = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: chunk }),
    });
    lastResult = await res.json() as Record<string, unknown>;
  }

  return lastResult!;
}

/**
 * Download an attachment from Discord.
 * @param url - Attachment URL
 */
export async function downloadAttachment(url: string): Promise<Buffer> {
  const res: Response = await fetch(url);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Add a reaction to a message.
 * @param botToken - Discord bot token
 * @param channelId - Channel ID
 * @param messageId - Message ID
 * @param emoji - Emoji (URL-encoded for custom)
 */
export async function addReaction(
  botToken: string,
  channelId: string,
  messageId: string,
  emoji: string = '%F0%9F%91%80'
): Promise<void> {
  await fetch(
    `${DISCORD_API}/channels/${channelId}/messages/${messageId}/reactions/${emoji}/@me`,
    {
      method: 'PUT',
      headers: { 'Authorization': `Bot ${botToken}` },
    }
  );
}

/**
 * Trigger typing indicator in a channel.
 * Discord typing indicators last ~10 seconds.
 * @param botToken - Discord bot token
 * @param channelId - Channel ID
 */
export async function triggerTyping(botToken: string, channelId: string): Promise<void> {
  await fetch(`${DISCORD_API}/channels/${channelId}/typing`, {
    method: 'POST',
    headers: { 'Authorization': `Bot ${botToken}` },
  });
}

/**
 * Respond to a Discord interaction (slash command or component).
 * @param interactionId - Interaction ID
 * @param interactionToken - Interaction token
 * @param data - Response data
 */
export async function respondToInteraction(
  interactionId: string,
  interactionToken: string,
  data: Record<string, unknown>
): Promise<void> {
  await fetch(`${DISCORD_API}/interactions/${interactionId}/${interactionToken}/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 4, data }),
  });
}

/**
 * Send a deferred response (shows "Bot is thinking...").
 * @param interactionId - Interaction ID
 * @param interactionToken - Interaction token
 */
export async function deferInteraction(
  interactionId: string,
  interactionToken: string
): Promise<void> {
  await fetch(`${DISCORD_API}/interactions/${interactionId}/${interactionToken}/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 5 }),
  });
}

/**
 * Edit the deferred response.
 * @param applicationId - Application ID
 * @param interactionToken - Interaction token
 * @param content - Message content
 */
export async function editDeferredResponse(
  applicationId: string,
  interactionToken: string,
  content: string
): Promise<void> {
  const chunks: string[] = smartSplit(content, 2000);

  // Edit the original deferred response with first chunk
  await fetch(`${DISCORD_API}/webhooks/${applicationId}/${interactionToken}/messages/@original`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: chunks[0] }),
  });

  // Send additional chunks as follow-ups
  for (let i: number = 1; i < chunks.length; i++) {
    await fetch(`${DISCORD_API}/webhooks/${applicationId}/${interactionToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: chunks[i] }),
    });
  }
}

/**
 * Convert markdown to Discord-compatible format.
 * Discord natively supports most markdown, just needs minor adjustments.
 * @param text - Markdown text
 * @returns Discord-compatible markdown
 */
export function markdownToDiscord(text: string): string {
  if (!text) return '';
  // Discord supports markdown natively, minimal conversion needed
  // Just ensure headings use ## format Discord understands
  return text;
}

/**
 * Smart split text into chunks at natural boundaries.
 * @param text - Text to split
 * @param maxLength - Maximum chunk length
 */
function smartSplit(text: string, maxLength: number = 2000): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining: string = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    const chunk: string = remaining.slice(0, maxLength);
    let splitAt: number = -1;

    for (const delim of ['\n\n', '\n', '. ', ' ']) {
      const idx: number = chunk.lastIndexOf(delim);
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
