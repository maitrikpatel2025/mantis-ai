/**
 * Discord API helpers.
 * Uses Discord REST API directly via fetch (no gateway connection needed).
 */

const DISCORD_API = 'https://discord.com/api/v10';

/**
 * Send a message to a Discord channel.
 * Automatically splits messages exceeding 2000 chars.
 * @param {string} botToken - Discord bot token
 * @param {string} channelId - Channel ID
 * @param {string} text - Message content
 * @returns {Promise<object>}
 */
export async function sendMessage(botToken, channelId, text) {
  const chunks = smartSplit(text, 2000);
  let lastResult;

  for (const chunk of chunks) {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: chunk }),
    });
    lastResult = await res.json();
  }

  return lastResult;
}

/**
 * Download an attachment from Discord.
 * @param {string} url - Attachment URL
 * @returns {Promise<Buffer>}
 */
export async function downloadAttachment(url) {
  const res = await fetch(url);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Add a reaction to a message.
 * @param {string} botToken - Discord bot token
 * @param {string} channelId - Channel ID
 * @param {string} messageId - Message ID
 * @param {string} [emoji='👀'] - Emoji (URL-encoded for custom)
 */
export async function addReaction(botToken, channelId, messageId, emoji = '%F0%9F%91%80') {
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
 * @param {string} botToken - Discord bot token
 * @param {string} channelId - Channel ID
 */
export async function triggerTyping(botToken, channelId) {
  await fetch(`${DISCORD_API}/channels/${channelId}/typing`, {
    method: 'POST',
    headers: { 'Authorization': `Bot ${botToken}` },
  });
}

/**
 * Respond to a Discord interaction (slash command or component).
 * @param {string} interactionId
 * @param {string} interactionToken
 * @param {object} data - Response data
 */
export async function respondToInteraction(interactionId, interactionToken, data) {
  await fetch(`${DISCORD_API}/interactions/${interactionId}/${interactionToken}/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 4, data }),
  });
}

/**
 * Send a deferred response (shows "Bot is thinking...").
 * @param {string} interactionId
 * @param {string} interactionToken
 */
export async function deferInteraction(interactionId, interactionToken) {
  await fetch(`${DISCORD_API}/interactions/${interactionId}/${interactionToken}/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 5 }),
  });
}

/**
 * Edit the deferred response.
 * @param {string} applicationId
 * @param {string} interactionToken
 * @param {string} content - Message content
 */
export async function editDeferredResponse(applicationId, interactionToken, content) {
  const chunks = smartSplit(content, 2000);

  // Edit the original deferred response with first chunk
  await fetch(`${DISCORD_API}/webhooks/${applicationId}/${interactionToken}/messages/@original`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: chunks[0] }),
  });

  // Send additional chunks as follow-ups
  for (let i = 1; i < chunks.length; i++) {
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
 * @param {string} text
 * @returns {string}
 */
export function markdownToDiscord(text) {
  if (!text) return '';
  // Discord supports markdown natively, minimal conversion needed
  // Just ensure headings use ## format Discord understands
  return text;
}

/**
 * Smart split text into chunks at natural boundaries.
 * @param {string} text
 * @param {number} maxLength
 * @returns {string[]}
 */
function smartSplit(text, maxLength = 2000) {
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
