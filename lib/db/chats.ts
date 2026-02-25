import { randomUUID } from 'crypto';
import { eq, desc, asc } from 'drizzle-orm';
import { getDb } from './index.js';
import { chats, messages } from './schema.js';

/**
 * Create a new chat.
 */
export function createChat(userId: string, title: string = 'New Chat', id: string | null = null) {
  const db = getDb();
  const now = Date.now();
  const chat = {
    id: id || randomUUID(),
    userId,
    title,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(chats).values(chat).run();
  return chat;
}

/**
 * Get all chats for a user, ordered by most recently updated.
 */
export function getChatsByUser(userId: string) {
  const db = getDb();
  return db
    .select()
    .from(chats)
    .where(eq(chats.userId, userId))
    .orderBy(desc(chats.updatedAt))
    .all();
}

/**
 * Get a single chat by ID.
 */
export function getChatById(chatId: string) {
  const db = getDb();
  return db.select().from(chats).where(eq(chats.id, chatId)).get();
}

/**
 * Update a chat's title.
 */
export function updateChatTitle(chatId: string, title: string): void {
  const db = getDb();
  db.update(chats)
    .set({ title, updatedAt: Date.now() })
    .where(eq(chats.id, chatId))
    .run();
}

/**
 * Toggle a chat's starred status.
 */
export function toggleChatStarred(chatId: string): number {
  const db = getDb();
  const chat = db.select({ starred: chats.starred }).from(chats).where(eq(chats.id, chatId)).get();
  const newValue = chat?.starred ? 0 : 1;
  db.update(chats)
    .set({ starred: newValue })
    .where(eq(chats.id, chatId))
    .run();
  return newValue;
}

/**
 * Delete a chat and all its messages.
 */
export function deleteChat(chatId: string): void {
  const db = getDb();
  db.delete(messages).where(eq(messages.chatId, chatId)).run();
  db.delete(chats).where(eq(chats.id, chatId)).run();
}

/**
 * Delete all chats and messages for a user.
 */
export function deleteAllChatsByUser(userId: string): void {
  const db = getDb();
  const userChats = db
    .select({ id: chats.id })
    .from(chats)
    .where(eq(chats.userId, userId))
    .all();

  for (const chat of userChats) {
    db.delete(messages).where(eq(messages.chatId, chat.id)).run();
  }
  db.delete(chats).where(eq(chats.userId, userId)).run();
}

/**
 * Get all messages for a chat, ordered by creation time.
 */
export function getMessagesByChatId(chatId: string) {
  const db = getDb();
  return db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt))
    .all();
}

/**
 * Save a message to a chat. Also updates the chat's updatedAt timestamp.
 */
export function saveMessage(chatId: string, role: string, content: string, id: string | null = null) {
  const db = getDb();
  const now = Date.now();
  const message = {
    id: id || randomUUID(),
    chatId,
    role,
    content,
    createdAt: now,
  };
  db.insert(messages).values(message).run();
  db.update(chats).set({ updatedAt: now }).where(eq(chats.id, chatId)).run();
  return message;
}
