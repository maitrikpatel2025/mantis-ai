const DISCORD_API = "https://discord.com/api/v10";
async function sendMessage(botToken, channelId, text) {
  const chunks = smartSplit(text, 2e3);
  let lastResult;
  for (const chunk of chunks) {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bot ${botToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ content: chunk })
    });
    lastResult = await res.json();
  }
  return lastResult;
}
async function downloadAttachment(url) {
  const res = await fetch(url);
  return Buffer.from(await res.arrayBuffer());
}
async function addReaction(botToken, channelId, messageId, emoji = "%F0%9F%91%80") {
  await fetch(
    `${DISCORD_API}/channels/${channelId}/messages/${messageId}/reactions/${emoji}/@me`,
    {
      method: "PUT",
      headers: { "Authorization": `Bot ${botToken}` }
    }
  );
}
async function triggerTyping(botToken, channelId) {
  await fetch(`${DISCORD_API}/channels/${channelId}/typing`, {
    method: "POST",
    headers: { "Authorization": `Bot ${botToken}` }
  });
}
async function respondToInteraction(interactionId, interactionToken, data) {
  await fetch(`${DISCORD_API}/interactions/${interactionId}/${interactionToken}/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: 4, data })
  });
}
async function deferInteraction(interactionId, interactionToken) {
  await fetch(`${DISCORD_API}/interactions/${interactionId}/${interactionToken}/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: 5 })
  });
}
async function editDeferredResponse(applicationId, interactionToken, content) {
  const chunks = smartSplit(content, 2e3);
  await fetch(`${DISCORD_API}/webhooks/${applicationId}/${interactionToken}/messages/@original`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: chunks[0] })
  });
  for (let i = 1; i < chunks.length; i++) {
    await fetch(`${DISCORD_API}/webhooks/${applicationId}/${interactionToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: chunks[i] })
    });
  }
}
function markdownToDiscord(text) {
  if (!text) return "";
  return text;
}
function smartSplit(text, maxLength = 2e3) {
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
  deferInteraction,
  downloadAttachment,
  editDeferredResponse,
  markdownToDiscord,
  respondToInteraction,
  sendMessage,
  triggerTyping
};
