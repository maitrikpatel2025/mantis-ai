/**
 * WhatsApp Cloud API helpers.
 * Uses the Meta Graph API directly via fetch — no extra dependencies.
 */

const GRAPH_API = 'https://graph.facebook.com/v21.0';

/**
 * Send a text message via WhatsApp.
 * @param {string} phoneNumberId - WhatsApp phone number ID
 * @param {string} accessToken - WhatsApp access token
 * @param {string} to - Recipient phone number (with country code)
 * @param {string} text - Message text
 * @returns {Promise<object>}
 */
export async function sendMessage(phoneNumberId, accessToken, to, text) {
  const chunks = smartSplit(text, 4096);
  let lastResult;

  for (const chunk of chunks) {
    const res = await fetch(`${GRAPH_API}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: chunk },
      }),
    });
    lastResult = await res.json();
  }

  return lastResult;
}

/**
 * Download media from WhatsApp.
 * Two-step: get media URL, then download.
 * @param {string} accessToken - WhatsApp access token
 * @param {string} mediaId - Media ID from webhook
 * @returns {Promise<{ buffer: Buffer, mimeType: string }>}
 */
export async function downloadMedia(accessToken, mediaId) {
  // Step 1: Get media URL
  const metaRes = await fetch(`${GRAPH_API}/${mediaId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  const meta = await metaRes.json();

  if (!meta.url) {
    throw new Error(`Failed to get media URL: ${JSON.stringify(meta)}`);
  }

  // Step 2: Download media
  const mediaRes = await fetch(meta.url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  const buffer = Buffer.from(await mediaRes.arrayBuffer());

  return { buffer, mimeType: meta.mime_type || 'application/octet-stream' };
}

/**
 * Mark a message as read.
 * @param {string} phoneNumberId
 * @param {string} accessToken
 * @param {string} messageId - WhatsApp message ID
 */
export async function markRead(phoneNumberId, accessToken, messageId) {
  await fetch(`${GRAPH_API}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }),
  });
}

/**
 * Smart split text into chunks at natural boundaries.
 * @param {string} text
 * @param {number} maxLength
 * @returns {string[]}
 */
function smartSplit(text, maxLength = 4096) {
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
