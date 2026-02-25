/**
 * Slack API helpers.
 * Uses the Slack Web API directly via fetch (no SDK dependency for runtime).
 */

const SLACK_API: string = 'https://slack.com/api';

interface SendMessageOptions {
  thread_ts?: string;
}

interface SlackMessageBody {
  channel: string;
  text: string;
  mrkdwn: boolean;
  thread_ts?: string;
}

/**
 * Send a message to a Slack channel or thread.
 * @param botToken - Slack bot token
 * @param channel - Channel ID
 * @param text - Message text (mrkdwn supported)
 * @param options - Optional settings (e.g., thread_ts for replies)
 */
export async function sendMessage(
  botToken: string,
  channel: string,
  text: string,
  options: SendMessageOptions = {}
): Promise<Record<string, unknown>> {
  const chunks: string[] = smartSplit(text, 3000);
  let lastResult: Record<string, unknown> | undefined;

  for (const chunk of chunks) {
    const body: SlackMessageBody = {
      channel,
      text: chunk,
      mrkdwn: true,
    };
    if (options.thread_ts) body.thread_ts = options.thread_ts;

    const res: Response = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    lastResult = await res.json() as Record<string, unknown>;
  }

  return lastResult!;
}

/**
 * Download a file from Slack.
 * @param botToken - Slack bot token
 * @param urlPrivate - File's url_private
 */
export async function downloadFile(botToken: string, urlPrivate: string): Promise<Buffer> {
  const res: Response = await fetch(urlPrivate, {
    headers: { 'Authorization': `Bearer ${botToken}` },
  });
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Add an emoji reaction to a message.
 * @param botToken - Slack bot token
 * @param channel - Channel ID
 * @param timestamp - Message timestamp
 * @param emoji - Emoji name (without colons)
 */
export async function addReaction(
  botToken: string,
  channel: string,
  timestamp: string,
  emoji: string = 'eyes'
): Promise<void> {
  await fetch(`${SLACK_API}/reactions.add`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel, timestamp, name: emoji }),
  });
}

/**
 * Convert markdown to Slack mrkdwn format.
 * @param text - Markdown text
 * @returns Slack mrkdwn
 */
export function markdownToMrkdwn(text: string): string {
  if (!text) return '';

  // Code blocks stay the same (```)
  // Bold: **text** -> *text*
  text = text.replace(/\*\*(.+?)\*\*/g, '*$1*');
  // Italic: _text_ stays the same
  // Strikethrough: ~~text~~ -> ~text~
  text = text.replace(/~~(.+?)~~/g, '~$1~');
  // Links: [text](url) -> <url|text>
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>');
  // Headings: # text -> *text*
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '*$1*');

  return text;
}

/**
 * Smart split text into chunks at natural boundaries.
 * @param text - Text to split
 * @param maxLength - Maximum chunk length
 */
function smartSplit(text: string, maxLength: number = 3000): string[] {
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
