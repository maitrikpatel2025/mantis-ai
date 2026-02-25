import { ChannelAdapter } from "./base.js";
import {
  sendMessage,
  editMessageText,
  downloadFile,
  reactToMessage,
  startTypingIndicator
} from "../tools/telegram.js";
import { isWhisperEnabled, transcribeAudio } from "../tools/openai.js";
class TelegramAdapter extends ChannelAdapter {
  botToken;
  constructor(botToken, channelConfig) {
    super(channelConfig);
    this.botToken = botToken;
  }
  /**
   * Parse a Telegram webhook update into normalized message data.
   * Handles: text, voice/audio (transcribed), photos, documents.
   * Returns null if the update should be ignored.
   */
  async receive(request) {
    const { TELEGRAM_WEBHOOK_SECRET, TELEGRAM_CHAT_ID, TELEGRAM_VERIFICATION } = process.env;
    if (!TELEGRAM_WEBHOOK_SECRET) {
      console.error("[telegram] TELEGRAM_WEBHOOK_SECRET not configured \u2014 rejecting webhook");
      return null;
    }
    const headerSecret = request.headers.get("x-telegram-bot-api-secret-token");
    if (headerSecret !== TELEGRAM_WEBHOOK_SECRET) {
      return null;
    }
    const update = await request.json();
    const message = update.message || update.edited_message;
    if (!message || !message.chat || !this.botToken) return null;
    const chatId = String(message.chat.id);
    let text = message.text || null;
    const attachments = [];
    if (TELEGRAM_VERIFICATION && text === TELEGRAM_VERIFICATION) {
      await sendMessage(this.botToken, chatId, `Your chat ID:
<code>${chatId}</code>`);
      return null;
    }
    if (!TELEGRAM_CHAT_ID) return null;
    if (chatId !== TELEGRAM_CHAT_ID) return null;
    if (message.voice) {
      if (!isWhisperEnabled()) {
        await sendMessage(
          this.botToken,
          chatId,
          "Voice messages are not supported. Please set OPENAI_API_KEY to enable transcription."
        );
        return null;
      }
      try {
        const { buffer, filename } = await downloadFile(this.botToken, message.voice.file_id);
        text = await transcribeAudio(buffer, filename);
      } catch (err) {
        console.error("Failed to transcribe voice:", err);
        await sendMessage(this.botToken, chatId, "Sorry, I could not transcribe your voice message.");
        return null;
      }
    }
    if (message.audio && !text) {
      if (!isWhisperEnabled()) {
        await sendMessage(
          this.botToken,
          chatId,
          "Audio messages are not supported. Please set OPENAI_API_KEY to enable transcription."
        );
        return null;
      }
      try {
        const { buffer, filename } = await downloadFile(this.botToken, message.audio.file_id);
        text = await transcribeAudio(buffer, filename);
      } catch (err) {
        console.error("Failed to transcribe audio:", err);
        await sendMessage(this.botToken, chatId, "Sorry, I could not transcribe your audio message.");
        return null;
      }
    }
    if (message.photo && message.photo.length > 0) {
      try {
        const largest = message.photo[message.photo.length - 1];
        const { buffer } = await downloadFile(this.botToken, largest.file_id);
        attachments.push({ category: "image", mimeType: "image/jpeg", data: buffer });
        if (!text && message.caption) text = message.caption;
      } catch (err) {
        console.error("Failed to download photo:", err);
      }
    }
    if (message.document) {
      try {
        const { buffer } = await downloadFile(this.botToken, message.document.file_id);
        const mimeType = message.document.mime_type || "application/octet-stream";
        attachments.push({ category: "document", mimeType, data: buffer });
        if (!text && message.caption) text = message.caption;
      } catch (err) {
        console.error("Failed to download document:", err);
      }
    }
    if (!text && attachments.length === 0) return null;
    const senderId = String(message.from?.id || "");
    const isGroup = message.chat.type === "group" || message.chat.type === "supergroup";
    const policy = this.checkPolicy({ senderId, isGroup, text: text || void 0, channelId: this.channelConfig.id });
    if (!policy.allowed) {
      console.log(`[telegram] Policy blocked: ${policy.reason} (sender: ${senderId})`);
      return null;
    }
    return {
      threadId: chatId,
      text: text || "",
      attachments,
      metadata: { messageId: message.message_id, chatId, senderId, isGroup }
    };
  }
  async acknowledge(metadata) {
    await reactToMessage(this.botToken, metadata.chatId, metadata.messageId).catch(() => {
    });
  }
  startProcessingIndicator(metadata) {
    return startTypingIndicator(this.botToken, metadata.chatId);
  }
  async sendResponse(threadId, text, _metadata) {
    await sendMessage(this.botToken, threadId, text);
  }
  get supportsStreaming() {
    return false;
  }
  get supportsChunkedDelivery() {
    const streaming = this.channelConfig?.streaming;
    return streaming?.enabled === true;
  }
  async sendStreamChunk(threadId, _chunk, fullText, metadata) {
    const messageId = metadata?._streamMessageId;
    if (!messageId) {
      const result = await sendMessage(this.botToken, threadId, fullText + "...");
      return String(result.message_id);
    }
    try {
      await editMessageText(this.botToken, threadId, messageId, fullText + "...");
    } catch (err) {
      if (!err.message?.includes("not modified")) {
        throw err;
      }
    }
  }
  async sendStreamEnd(threadId, fullText, metadata) {
    const messageId = metadata?._streamMessageId;
    if (messageId) {
      try {
        await editMessageText(this.botToken, threadId, messageId, fullText);
      } catch (err) {
        if (!err.message?.includes("not modified")) {
          throw err;
        }
      }
    } else {
      await sendMessage(this.botToken, threadId, fullText);
    }
  }
}
export {
  TelegramAdapter
};
