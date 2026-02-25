import { createHmac, timingSafeEqual } from "crypto";
import { ChannelAdapter } from "./base.js";
import {
  sendMessage,
  downloadFile,
  addReaction,
  markdownToMrkdwn
} from "../tools/slack.js";
import { isWhisperEnabled, transcribeAudio } from "../tools/openai.js";
class SlackAdapter extends ChannelAdapter {
  botToken;
  signingSecret;
  /**
   * @param botToken - Slack bot OAuth token
   * @param signingSecret - Slack signing secret for request verification
   * @param channelConfig - Full channel config from CHANNELS.json
   */
  constructor(botToken, signingSecret, channelConfig) {
    super(channelConfig);
    this.botToken = botToken;
    this.signingSecret = signingSecret;
  }
  /**
   * Verify Slack request signature (v0 scheme).
   */
  verifySignature(body, timestamp, signature) {
    if (!timestamp || !signature || !this.signingSecret) return false;
    const now = Math.floor(Date.now() / 1e3);
    if (Math.abs(now - Number(timestamp)) > 300) return false;
    const sigBasestring = `v0:${timestamp}:${body}`;
    const hmac = createHmac("sha256", this.signingSecret).update(sigBasestring).digest("hex");
    const expected = `v0=${hmac}`;
    const bufA = Buffer.from(expected);
    const bufB = Buffer.from(signature);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
  async receive(request) {
    const rawBody = await request.text();
    const timestamp = request.headers.get("x-slack-request-timestamp");
    const signature = request.headers.get("x-slack-signature");
    if (!this.verifySignature(rawBody, timestamp, signature)) {
      return null;
    }
    const body = JSON.parse(rawBody);
    if (body.type === "url_verification") {
      return { _challenge: body.challenge };
    }
    if (body.type !== "event_callback") return null;
    const event = body.event;
    if (!event) return null;
    if (event.type !== "message" || event.subtype || event.bot_id) return null;
    let text = event.text || "";
    const attachments = [];
    if (event.files && event.files.length > 0) {
      for (const file of event.files) {
        try {
          if (file.mimetype?.startsWith("audio/") && isWhisperEnabled()) {
            const buffer = await downloadFile(this.botToken, file.url_private);
            const transcription = await transcribeAudio(buffer, file.name || "audio.ogg");
            text = text ? `${text}
${transcription}` : transcription;
          } else if (file.mimetype?.startsWith("image/")) {
            const buffer = await downloadFile(this.botToken, file.url_private);
            attachments.push({ category: "image", mimeType: file.mimetype, data: buffer });
          } else {
            const buffer = await downloadFile(this.botToken, file.url_private);
            attachments.push({
              category: "document",
              mimeType: file.mimetype || "application/octet-stream",
              data: buffer
            });
          }
        } catch (err) {
          console.error("[slack] Failed to download file:", err);
        }
      }
    }
    if (!text && attachments.length === 0) return null;
    const senderId = event.user || "";
    const isGroup = event.channel_type === "channel" || event.channel_type === "group";
    const policy = this.checkPolicy({ senderId, isGroup, text, channelId: this.channelConfig.id });
    if (!policy.allowed) {
      console.log(`[slack] Policy blocked: ${policy.reason} (sender: ${senderId})`);
      return null;
    }
    return {
      threadId: event.channel,
      text,
      attachments,
      metadata: {
        channel: event.channel,
        ts: event.ts,
        thread_ts: event.thread_ts || event.ts,
        team: body.team_id,
        senderId,
        isGroup
      }
    };
  }
  async acknowledge(metadata) {
    await addReaction(this.botToken, metadata.channel, metadata.ts, "eyes").catch(() => {
    });
  }
  startProcessingIndicator(_metadata) {
    return () => {
    };
  }
  async sendResponse(threadId, text, metadata) {
    const mrkdwn = markdownToMrkdwn(text);
    await sendMessage(this.botToken, threadId, mrkdwn, {
      thread_ts: metadata?.thread_ts
    });
  }
  get supportsStreaming() {
    return false;
  }
}
export {
  SlackAdapter
};
