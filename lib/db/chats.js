import { randomUUID } from "crypto";
import { eq, desc, asc } from "drizzle-orm";
import { getDb } from "./index.js";
import { chats, messages } from "./schema.js";
function createChat(userId, title = "New Chat", id = null) {
  const db = getDb();
  const now = Date.now();
  const chat = {
    id: id || randomUUID(),
    userId,
    title,
    createdAt: now,
    updatedAt: now
  };
  db.insert(chats).values(chat).run();
  return chat;
}
function getChatsByUser(userId) {
  const db = getDb();
  return db.select().from(chats).where(eq(chats.userId, userId)).orderBy(desc(chats.updatedAt)).all();
}
function getChatById(chatId) {
  const db = getDb();
  return db.select().from(chats).where(eq(chats.id, chatId)).get();
}
function updateChatTitle(chatId, title) {
  const db = getDb();
  db.update(chats).set({ title, updatedAt: Date.now() }).where(eq(chats.id, chatId)).run();
}
function toggleChatStarred(chatId) {
  const db = getDb();
  const chat = db.select({ starred: chats.starred }).from(chats).where(eq(chats.id, chatId)).get();
  const newValue = chat?.starred ? 0 : 1;
  db.update(chats).set({ starred: newValue }).where(eq(chats.id, chatId)).run();
  return newValue;
}
function deleteChat(chatId) {
  const db = getDb();
  db.delete(messages).where(eq(messages.chatId, chatId)).run();
  db.delete(chats).where(eq(chats.id, chatId)).run();
}
function deleteAllChatsByUser(userId) {
  const db = getDb();
  const userChats = db.select({ id: chats.id }).from(chats).where(eq(chats.userId, userId)).all();
  for (const chat of userChats) {
    db.delete(messages).where(eq(messages.chatId, chat.id)).run();
  }
  db.delete(chats).where(eq(chats.userId, userId)).run();
}
function getMessagesByChatId(chatId) {
  const db = getDb();
  return db.select().from(messages).where(eq(messages.chatId, chatId)).orderBy(asc(messages.createdAt)).all();
}
function saveMessage(chatId, role, content, id = null) {
  const db = getDb();
  const now = Date.now();
  const message = {
    id: id || randomUUID(),
    chatId,
    role,
    content,
    createdAt: now
  };
  db.insert(messages).values(message).run();
  db.update(chats).set({ updatedAt: now }).where(eq(chats.id, chatId)).run();
  return message;
}
export {
  createChat,
  deleteAllChatsByUser,
  deleteChat,
  getChatById,
  getChatsByUser,
  getMessagesByChatId,
  saveMessage,
  toggleChatStarred,
  updateChatTitle
};
