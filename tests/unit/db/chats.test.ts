import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from '../../helpers/db.js';

let testDb: ReturnType<typeof createTestDb>;

vi.mock('../../../lib/db/index.js', () => ({
  getDb: () => testDb.db,
}));

const { createChat, getChatsByUser, getChatById, updateChatTitle, toggleChatStarred, deleteChat, getMessagesByChatId, saveMessage, deleteAllChatsByUser } = await import('../../../lib/db/chats.js');

describe('DB: Chats', () => {
  const userId = 'user-1';

  beforeEach(() => {
    testDb = createTestDb();
  });

  it('createChat creates a chat with defaults', () => {
    const chat = createChat(userId);
    expect(chat.userId).toBe(userId);
    expect(chat.title).toBe('New Chat');
    expect(chat.id).toBeDefined();
  });

  it('createChat with custom title and ID', () => {
    const chat = createChat(userId, 'My Chat', 'custom-id');
    expect(chat.title).toBe('My Chat');
    expect(chat.id).toBe('custom-id');
  });

  it('getChatsByUser returns all chats for user', () => {
    createChat(userId, 'Chat 1');
    createChat(userId, 'Chat 2');
    const chats = getChatsByUser(userId);
    expect(chats).toHaveLength(2);
    // Both chats belong to the user
    const titles = chats.map(c => c.title).sort();
    expect(titles).toEqual(['Chat 1', 'Chat 2']);
  });

  it('getChatById retrieves specific chat', () => {
    const created = createChat(userId, 'Test', 'my-chat-id');
    const found = getChatById('my-chat-id');
    expect(found).toBeDefined();
    expect(found!.title).toBe('Test');
  });

  it('updateChatTitle changes the title', () => {
    const chat = createChat(userId, 'Old Title');
    updateChatTitle(chat.id, 'New Title');
    const updated = getChatById(chat.id);
    expect(updated!.title).toBe('New Title');
  });

  it('toggleChatStarred toggles between 0 and 1', () => {
    const chat = createChat(userId);
    const result1 = toggleChatStarred(chat.id);
    expect(result1).toBe(1);
    const result2 = toggleChatStarred(chat.id);
    expect(result2).toBe(0);
  });

  it('saveMessage and getMessagesByChatId', () => {
    const chat = createChat(userId);
    saveMessage(chat.id, 'user', 'Hello');
    saveMessage(chat.id, 'assistant', 'Hi there!');
    const messages = getMessagesByChatId(chat.id);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
  });

  it('deleteChat removes chat and its messages', () => {
    const chat = createChat(userId);
    saveMessage(chat.id, 'user', 'Hello');
    deleteChat(chat.id);
    expect(getChatById(chat.id)).toBeUndefined();
    expect(getMessagesByChatId(chat.id)).toHaveLength(0);
  });

  it('deleteAllChatsByUser removes all user chats', () => {
    createChat(userId, 'Chat 1');
    createChat(userId, 'Chat 2');
    createChat('other-user', 'Other Chat');
    deleteAllChatsByUser(userId);
    expect(getChatsByUser(userId)).toHaveLength(0);
    expect(getChatsByUser('other-user')).toHaveLength(1);
  });
});
