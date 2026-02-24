import { randomUUID } from 'crypto';
import { eq, desc, like, or, sql } from 'drizzle-orm';
import { getDb } from './index.js';
import { memories } from './schema.js';

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
 * @param {object} params
 * @param {string} params.content
 * @param {string} [params.category='general']
 * @param {string} [params.sourceJobId]
 * @param {number} [params.relevance=5]
 * @returns {object} The created memory
 */
export function createMemory({ content, category = 'general', sourceJobId, relevance = 5 }) {
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
 * @param {object} [options]
 * @param {string} [options.category]
 * @param {number} [options.limit=50]
 * @returns {object[]}
 */
export function getMemories({ category, limit = 50 } = {}) {
  const db = getDb();
  let query = db.select().from(memories);
  if (category) {
    query = query.where(eq(memories.category, category));
  }
  return query.orderBy(desc(memories.relevance), desc(memories.createdAt)).limit(limit).all();
}

/**
 * Search memories by keyword using SQLite LIKE.
 * @param {string} query - Search query
 * @param {object} [options]
 * @param {string} [options.category]
 * @param {number} [options.limit=20]
 * @returns {object[]}
 */
export function searchMemories(query, { category, limit = 20 } = {}) {
  const db = getDb();
  const pattern = `%${query}%`;
  let q = db.select().from(memories).where(like(memories.content, pattern));
  if (category) {
    q = q.where(eq(memories.category, category));
  }
  return q.orderBy(desc(memories.relevance), desc(memories.createdAt)).limit(limit).all();
}

/**
 * Extract keywords from a prompt for memory search.
 * @param {string} text
 * @returns {string[]}
 */
function extractKeywords(text) {
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
 * @param {string} prompt
 * @param {object} [options]
 * @param {number} [options.limit=5]
 * @returns {object[]}
 */
export function getRelevantMemories(prompt, { limit = 5 } = {}) {
  const keywords = extractKeywords(prompt);
  if (keywords.length === 0) return [];

  const db = getDb();
  const conditions = keywords.map((kw) => like(memories.content, `%${kw}%`));
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
 * @param {string} id
 * @param {object} fields - { content, category, relevance }
 */
export function updateMemory(id, fields) {
  const db = getDb();
  db.update(memories)
    .set({ ...fields, updatedAt: Date.now() })
    .where(eq(memories.id, id))
    .run();
}

/**
 * Delete a memory.
 * @param {string} id
 */
export function deleteMemory(id) {
  const db = getDb();
  db.delete(memories).where(eq(memories.id, id)).run();
}

/**
 * Bulk insert memories.
 * @param {Array<{ content: string, category?: string, sourceJobId?: string, relevance?: number }>} entries
 * @returns {object[]} The inserted memories
 */
export function insertMemories(entries) {
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
