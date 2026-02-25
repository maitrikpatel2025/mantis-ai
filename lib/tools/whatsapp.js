const GRAPH_API = "https://graph.facebook.com/v21.0";
async function sendMessage(phoneNumberId, accessToken, to, text) {
  const chunks = smartSplit(text, 4096);
  let lastResult;
  for (const chunk of chunks) {
    const res = await fetch(`${GRAPH_API}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: chunk }
      })
    });
    lastResult = await res.json();
  }
  return lastResult;
}
async function downloadMedia(accessToken, mediaId) {
  const metaRes = await fetch(`${GRAPH_API}/${mediaId}`, {
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
  const meta = await metaRes.json();
  if (!meta.url) {
    throw new Error(`Failed to get media URL: ${JSON.stringify(meta)}`);
  }
  const mediaRes = await fetch(meta.url, {
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
  const buffer = Buffer.from(await mediaRes.arrayBuffer());
  return { buffer, mimeType: meta.mime_type || "application/octet-stream" };
}
async function markRead(phoneNumberId, accessToken, messageId) {
  await fetch(`${GRAPH_API}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId
    })
  });
}
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
  downloadMedia,
  markRead,
  sendMessage
};
