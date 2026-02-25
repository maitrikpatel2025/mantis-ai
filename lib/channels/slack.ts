import { createHmac, timingSafeEqual } from 'crypto';
import { ChannelAdapter } from './base.js';
import {
  sendMessage,
  downloadFile,
  addReaction,
  markdownToMrkdwn,
} from '../tools/slack.js';
import { isWhisperEnabled, transcribeAudio } from '../tools/openai.js';
import type { NormalizedMessage, ChannelMetadata, Attachment } from '../types.js';

class SlackAdapter extends ChannelAdapter {
  botToken: string;
  signingSecret: string;

  /**
   * @param botToken - Slack bot OAuth token
   * @param signingSecret - Slack signing secret for request verification
   * @param channelConfig - Full channel config from CHANNELS.json
   */
  constructor(botToken: string, signingSecret: string, channelConfig?: Record<string, unknown>) {
    super(channelConfig);
    this.botToken = botToken;
    this.signingSecret = signingSecret;
  }

  /**
   * Verify Slack request signature (v0 scheme).
   */
  verifySignature(body: string, timestamp: string | null, signature: string | null): boolean {
    if (!timestamp || !signature || !this.signingSecret) return false;

    // Reject requests older than 5 minutes
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > 300) return false;

    const sigBasestring = `v0:${timestamp}:${body}`;
    const hmac = createHmac('sha256', this.signingSecret)
      .update(sigBasestring)
      .digest('hex');
    const expected = `v0=${hmac}`;

    const bufA = Buffer.from(expected);
    const bufB = Buffer.from(signature);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  async receive(request: Request): Promise<NormalizedMessage | null> {
    const rawBody = await request.text();
    const timestamp = request.headers.get('x-slack-request-timestamp');
    const signature = request.headers.get('x-slack-signature');

    // Verify request signature
    if (!this.verifySignature(rawBody, timestamp, signature)) {
      return null;
    }

    const body = JSON.parse(rawBody);

    // Handle Slack URL verification challenge
    if (body.type === 'url_verification') {
      return { _challenge: body.challenge } as unknown as NormalizedMessage;
    }

    // Only handle event callbacks
    if (body.type !== 'event_callback') return null;

    const event = body.event;
    if (!event) return null;

    // Only handle messages (ignore bot messages, message_changed, etc.)
    if (event.type !== 'message' || event.subtype || event.bot_id) return null;

    let text: string = event.text || '';
    const attachments: Attachment[] = [];

    // Handle file attachments
    if (event.files && event.files.length > 0) {
      for (const file of event.files) {
        try {
          if (file.mimetype?.startsWith('audio/') && isWhisperEnabled()) {
            // Transcribe audio files
            const buffer = await downloadFile(this.botToken, file.url_private);
            const transcription = await transcribeAudio(buffer, file.name || 'audio.ogg');
            text = text ? `${text}\n${transcription}` : transcription;
          } else if (file.mimetype?.startsWith('image/')) {
            const buffer = await downloadFile(this.botToken, file.url_private);
            attachments.push({ category: 'image', mimeType: file.mimetype, data: buffer });
          } else {
            const buffer = await downloadFile(this.botToken, file.url_private);
            attachments.push({
              category: 'document',
              mimeType: file.mimetype || 'application/octet-stream',
              data: buffer,
            });
          }
        } catch (err) {
          console.error('[slack] Failed to download file:', err);
        }
      }
    }

    if (!text && attachments.length === 0) return null;

    const senderId: string = event.user || '';
    const isGroup: boolean = event.channel_type === 'channel' || event.channel_type === 'group';

    // Check channel policies
    const policy = this.checkPolicy({ senderId, isGroup, text, channelId: (this.channelConfig as Record<string, unknown>).id as string | undefined });
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
        isGroup,
      },
    };
  }

  async acknowledge(metadata: ChannelMetadata): Promise<void> {
    await addReaction(this.botToken, metadata.channel as string, metadata.ts as string, 'eyes').catch(() => {});
  }

  startProcessingIndicator(_metadata: ChannelMetadata): () => void {
    // Slack doesn't have a native typing indicator for bots
    return () => {};
  }

  async sendResponse(threadId: string, text: string, metadata?: ChannelMetadata): Promise<void> {
    const mrkdwn = markdownToMrkdwn(text);
    await sendMessage(this.botToken, threadId, mrkdwn, {
      thread_ts: metadata?.thread_ts as string | undefined,
    });
  }

  get supportsStreaming(): boolean {
    return false;
  }
}

export { SlackAdapter };
