import { randomUUID } from 'crypto';
import { eq, desc, like, or, and, SQL } from 'drizzle-orm';
import { getDb } from './index.js';
import { memories } from './schema.js';
import type { MemoryInsert } from '../types.js';

// Common stop words to filter out during keyword extraction
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'this', 'that', 'are', 'was',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'can',
  'could', 'should', 'may', 'might', 'not', 'no', 'so', 'if', 'then',
  'than', 'too', 'very', 'just', 'about', 'up', 'out', 'all', 'as', 'into',
  'also', 'how', 'what', 'when', 'where', 'which', 'who', 'why', 'each',
  'we', 'me', 'my', 'our', 'your', 'its', 'his', 'her', 'they', 'them',
  'their', 'you', 'he', 'she', 'i',
]);

/**
 * Create a new memory.
 */
export function createMemory({ content, category = 'general', sourceJobId, relevance = 5 }: MemoryInsert) {
  const db = getDb();
  const now = Date.now();
  const memory = {
    id: randomUUID(),
    content,
    category,
    sourceJobId: sourceJobId || null,
    relevance,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(memories).values(memory).run();
  return memory;
}

/**
 * Get memories, optionally filtered by category.
 */
export function getMemories({ category, limit = 50 }: { category?: string; limit?: number } = {}) {
  const db = getDb();
  let query = db.select().from(memories);
  if (category) {
    query = query.where(eq(memories.category, category)) as typeof query;
  }
  return query.orderBy(desc(memories.relevance), desc(memories.createdAt)).limit(limit).all();
}

/**
 * Search memories by keyword using SQLite LIKE.
 */
export function searchMemories(query: string, { category, limit = 20 }: { category?: string; limit?: number } = {}) {
  const db = getDb();
  const pattern = `%${query}%`;
  const conditions = category
    ? and(like(memories.content, pattern), eq(memories.category, category))
    : like(memories.content, pattern);
  return db.select().from(memories).where(conditions).orderBy(desc(memories.relevance), desc(memories.createdAt)).limit(limit).all();
}

/**
 * Extract keywords from a prompt for memory search.
 */
function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
    .filter((v, i, a) => a.indexOf(v) === i) // dedupe
    .slice(0, 10);
}

/**
 * Get memories relevant to a prompt using keyword extraction.
 */
export function getRelevantMemories(prompt: string, { limit = 5 }: { limit?: number } = {}) {
  const keywords = extractKeywords(prompt);
  if (keywords.length === 0) return [];

  const db = getDb();
  const conditions: SQL[] = keywords.map((kw) => like(memories.content, `%${kw}%`));
  return db
    .select()
    .from(memories)
    .where(or(...conditions))
    .orderBy(desc(memories.relevance), desc(memories.createdAt))
    .limit(limit)
    .all();
}

/**
 * Update a memory.
 */
export function updateMemory(id: string, fields: { content?: string; category?: string; relevance?: number }): void {
  const db = getDb();
  db.update(memories)
    .set({ ...fields, updatedAt: Date.now() })
    .where(eq(memories.id, id))
    .run();
}

/**
 * Delete a memory.
 */
export function deleteMemory(id: string): void {
  const db = getDb();
  db.delete(memories).where(eq(memories.id, id)).run();
}

/**
 * Bulk insert memories.
 */
export function insertMemories(entries: MemoryInsert[]) {
  const db = getDb();
  const now = Date.now();
  const rows = entries.map((e) => ({
    id: randomUUID(),
    content: e.content,
    category: e.category || 'general',
    sourceJobId: e.sourceJobId || null,
    relevance: e.relevance || 5,
    createdAt: now,
    updatedAt: now,
  }));
  if (rows.length > 0) {
    db.insert(memories).values(rows).run();
  }
  return rows;
}
