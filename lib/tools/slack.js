const SLACK_API = "https://slack.com/api";
async function sendMessage(botToken, channel, text, options = {}) {
  const chunks = smartSplit(text, 3e3);
  let lastResult;
  for (const chunk of chunks) {
    const body = {
      channel,
      text: chunk,
      mrkdwn: true
    };
    if (options.thread_ts) body.thread_ts = options.thread_ts;
    const res = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${botToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    lastResult = await res.json();
  }
  return lastResult;
}
async function downloadFile(botToken, urlPrivate) {
  const res = await fetch(urlPrivate, {
    headers: { "Authorization": `Bearer ${botToken}` }
  });
  return Buffer.from(await res.arrayBuffer());
}
async function addReaction(botToken, channel, timestamp, emoji = "eyes") {
  await fetch(`${SLACK_API}/reactions.add`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${botToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ channel, timestamp, name: emoji })
  });
}
function markdownToMrkdwn(text) {
  if (!text) return "";
  text = text.replace(/\*\*(.+?)\*\*/g, "*$1*");
  text = text.replace(/~~(.+?)~~/g, "~$1~");
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>");
  text = text.replace(/^#{1,6}\s+(.+)$/gm, "*$1*");
  return text;
}
function smartSplit(text, maxLength = 3e3) {
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
export {
  addReaction,
  downloadFile,
  markdownToMrkdwn,
  sendMessage
};
