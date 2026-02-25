/**
 * WhatsApp Cloud API helpers.
 * Uses the Meta Graph API directly via fetch — no extra dependencies.
 */

const GRAPH_API: string = 'https://graph.facebook.com/v21.0';

interface DownloadMediaResult {
  buffer: Buffer;
  mimeType: string;
}

/**
 * Send a text message via WhatsApp.
 * @param phoneNumberId - WhatsApp phone number ID
 * @param accessToken - WhatsApp access token
 * @param to - Recipient phone number (with country code)
 * @param text - Message text
 */
export async function sendMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string
): Promise<Record<string, unknown>> {
  const chunks: string[] = smartSplit(text, 4096);
  let lastResult: Record<string, unknown> | undefined;

  for (const chunk of chunks) {
    const res: Response = await fetch(`${GRAPH_API}/${phoneNumberId}/messages`, {
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
    lastResult = await res.json() as Record<string, unknown>;
  }

  return lastResult!;
}

/**
 * Download media from WhatsApp.
 * Two-step: get media URL, then download.
 * @param accessToken - WhatsApp access token
 * @param mediaId - Media ID from webhook
 */
export async function downloadMedia(
  accessToken: string,
  mediaId: string
): Promise<DownloadMediaResult> {
  // Step 1: Get media URL
  const metaRes: Response = await fetch(`${GRAPH_API}/${mediaId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  const meta: { url?: string; mime_type?: string } = await metaRes.json();

  if (!meta.url) {
    throw new Error(`Failed to get media URL: ${JSON.stringify(meta)}`);
  }

  // Step 2: Download media
  const mediaRes: Response = await fetch(meta.url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  const buffer: Buffer = Buffer.from(await mediaRes.arrayBuffer());

  return { buffer, mimeType: meta.mime_type || 'application/octet-stream' };
}

/**
 * Mark a message as read.
 * @param phoneNumberId - WhatsApp phone number ID
 * @param accessToken - WhatsApp access token
 * @param messageId - WhatsApp message ID
 */
export async function markRead(
  phoneNumberId: string,
  accessToken: string,
  messageId: string
): Promise<void> {
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
 * @param text - Text to split
 * @param maxLength - Maximum chunk length
 */
function smartSplit(text: string, maxLength: number = 4096): string[] {
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
