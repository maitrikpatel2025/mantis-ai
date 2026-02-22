/**
 * Slack API helpers.
 * Uses the Slack Web API directly via fetch (no SDK dependency for runtime).
 */

const SLACK_API = 'https://slack.com/api';

/**
 * Send a message to a Slack channel or thread.
 * @param {string} botToken - Slack bot token
 * @param {string} channel - Channel ID
 * @param {string} text - Message text (mrkdwn supported)
 * @param {object} [options]
 * @param {string} [options.thread_ts] - Thread timestamp for replies
 * @returns {Promise<object>}
 */
export async function sendMessage(botToken, channel, text, options = {}) {
  const chunks = smartSplit(text, 3000);
  let lastResult;

  for (const chunk of chunks) {
    const body = {
      channel,
      text: chunk,
      mrkdwn: true,
    };
    if (options.thread_ts) body.thread_ts = options.thread_ts;

    const res = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    lastResult = await res.json();
  }

  return lastResult;
}

/**
 * Download a file from Slack.
 * @param {string} botToken - Slack bot token
 * @param {string} urlPrivate - File's url_private
 * @returns {Promise<Buffer>}
 */
export async function downloadFile(botToken, urlPrivate) {
  const res = await fetch(urlPrivate, {
    headers: { 'Authorization': `Bearer ${botToken}` },
  });
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Add an emoji reaction to a message.
 * @param {string} botToken - Slack bot token
 * @param {string} channel - Channel ID
 * @param {string} timestamp - Message timestamp
 * @param {string} [emoji='eyes'] - Emoji name (without colons)
 */
export async function addReaction(botToken, channel, timestamp, emoji = 'eyes') {
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
 * @param {string} text - Markdown text
 * @returns {string} Slack mrkdwn
 */
export function markdownToMrkdwn(text) {
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
 * @param {string} text
 * @param {number} maxLength
 * @returns {string[]}
 */
function smartSplit(text, maxLength = 3000) {
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
