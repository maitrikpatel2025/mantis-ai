import { ChannelAdapter } from './base.js';
import {
  sendMessage,
  editMessageText,
  downloadFile,
  reactToMessage,
  startTypingIndicator,
} from '../tools/telegram.js';
import { isWhisperEnabled, transcribeAudio } from '../tools/openai.js';
import type { NormalizedMessage, ChannelMetadata, Attachment } from '../types.js';

class TelegramAdapter extends ChannelAdapter {
  botToken: string;

  constructor(botToken: string, channelConfig?: Record<string, unknown>) {
    super(channelConfig);
    this.botToken = botToken;
  }

  /**
   * Parse a Telegram webhook update into normalized message data.
   * Handles: text, voice/audio (transcribed), photos, documents.
   * Returns null if the update should be ignored.
   */
  async receive(request: Request): Promise<NormalizedMessage | null> {
    const { TELEGRAM_WEBHOOK_SECRET, TELEGRAM_CHAT_ID, TELEGRAM_VERIFICATION } = process.env;

    // Validate secret token (required)
    if (!TELEGRAM_WEBHOOK_SECRET) {
      console.error('[telegram] TELEGRAM_WEBHOOK_SECRET not configured — rejecting webhook');
      return null;
    }
    const headerSecret = request.headers.get('x-telegram-bot-api-secret-token');
    if (headerSecret !== TELEGRAM_WEBHOOK_SECRET) {
      return null;
    }

    const update = await request.json();
    const message = update.message || update.edited_message;

    if (!message || !message.chat || !this.botToken) return null;

    const chatId = String(message.chat.id);
    let text: string | null = message.text || null;
    const attachments: Attachment[] = [];

    // Check for verification code — works even before TELEGRAM_CHAT_ID is set
    if (TELEGRAM_VERIFICATION && text === TELEGRAM_VERIFICATION) {
      await sendMessage(this.botToken, chatId, `Your chat ID:\n<code>${chatId}</code>`);
      return null;
    }

    // Security: if no TELEGRAM_CHAT_ID configured, ignore all messages
    if (!TELEGRAM_CHAT_ID) return null;

    // Security: only accept messages from configured chat
    if (chatId !== TELEGRAM_CHAT_ID) return null;

    // Voice messages → transcribe to text
    if (message.voice) {
      if (!isWhisperEnabled()) {
        await sendMessage(
          this.botToken,
          chatId,
          'Voice messages are not supported. Please set OPENAI_API_KEY to enable transcription.'
        );
        return null;
      }
      try {
        const { buffer, filename } = await downloadFile(this.botToken, message.voice.file_id);
        text = await transcribeAudio(buffer, filename);
      } catch (err) {
        console.error('Failed to transcribe voice:', err);
        await sendMessage(this.botToken, chatId, 'Sorry, I could not transcribe your voice message.');
        return null;
      }
    }

    // Audio messages → transcribe to text
    if (message.audio && !text) {
      if (!isWhisperEnabled()) {
        await sendMessage(
          this.botToken,
          chatId,
          'Audio messages are not supported. Please set OPENAI_API_KEY to enable transcription.'
        );
        return null;
      }
      try {
        const { buffer, filename } = await downloadFile(this.botToken, message.audio.file_id);
        text = await transcribeAudio(buffer, filename);
      } catch (err) {
        console.error('Failed to transcribe audio:', err);
        await sendMessage(this.botToken, chatId, 'Sorry, I could not transcribe your audio message.');
        return null;
      }
    }

    // Photo → download largest size, add as image attachment
    if (message.photo && message.photo.length > 0) {
      try {
        const largest = message.photo[message.photo.length - 1];
        const { buffer } = await downloadFile(this.botToken, largest.file_id);
        attachments.push({ category: 'image', mimeType: 'image/jpeg', data: buffer });
        // Use caption as text if no text yet
        if (!text && message.caption) text = message.caption;
      } catch (err) {
        console.error('Failed to download photo:', err);
      }
    }

    // Document → download, add as document attachment
    if (message.document) {
      try {
        const { buffer } = await downloadFile(this.botToken, message.document.file_id);
        const mimeType = message.document.mime_type || 'application/octet-stream';
        attachments.push({ category: 'document', mimeType, data: buffer });
        if (!text && message.caption) text = message.caption;
      } catch (err) {
        console.error('Failed to download document:', err);
      }
    }

    // Nothing actionable
    if (!text && attachments.length === 0) return null;

    const senderId = String(message.from?.id || '');
    const isGroup = message.chat.type === 'group' || message.chat.type === 'supergroup';

    // Check channel policies
    const policy = this.checkPolicy({ senderId, isGroup, text: text || undefined, channelId: (this.channelConfig as Record<string, unknown>).id as string | undefined });
    if (!policy.allowed) {
      console.log(`[telegram] Policy blocked: ${policy.reason} (sender: ${senderId})`);
      return null;
    }

    return {
      threadId: chatId,
      text: text || '',
      attachments,
      metadata: { messageId: message.message_id, chatId, senderId, isGroup },
    };
  }

  async acknowledge(metadata: ChannelMetadata): Promise<void> {
    await reactToMessage(this.botToken, metadata.chatId as string, metadata.messageId as number).catch(() => {});
  }

  startProcessingIndicator(metadata: ChannelMetadata): () => void {
    return startTypingIndicator(this.botToken, metadata.chatId as string);
  }

  async sendResponse(threadId: string, text: string, _metadata?: ChannelMetadata): Promise<void> {
    await sendMessage(this.botToken, threadId, text);
  }

  get supportsStreaming(): boolean {
    return false;
  }

  get supportsChunkedDelivery(): boolean {
    const streaming = (this.channelConfig as Record<string, unknown>)?.streaming as { enabled?: boolean } | undefined;
    return streaming?.enabled === true;
  }

  async sendStreamChunk(
    threadId: string,
    _chunk: string,
    fullText: string,
    metadata?: ChannelMetadata
  ): Promise<string | void> {
    const messageId = metadata?._streamMessageId as number | undefined;

    if (!messageId) {
      // First chunk — send new message and return the message_id
      const result = await sendMessage(this.botToken, threadId, fullText + '...');
      return String((result as { message_id?: number }).message_id);
    }

    // Subsequent chunks — edit in place
    try {
      await editMessageText(this.botToken, threadId, messageId, fullText + '...');
    } catch (err) {
      // Ignore "message is not modified" errors
      if (!(err as Error).message?.includes('not modified')) {
        throw err;
      }
    }
  }

  async sendStreamEnd(
    threadId: string,
    fullText: string,
    metadata?: ChannelMetadata
  ): Promise<void> {
    const messageId = metadata?._streamMessageId as number | undefined;
    if (messageId) {
      try {
        await editMessageText(this.botToken, threadId, messageId, fullText);
      } catch (err) {
        if (!(err as Error).message?.includes('not modified')) {
          throw err;
        }
      }
    } else {
      // Fallback: send as a new message
      await sendMessage(this.botToken, threadId, fullText);
    }
  }
}

export { TelegramAdapter };
