import { randomUUID } from "crypto";
import { eq, desc, like, or, and } from "drizzle-orm";
import { getDb } from "./index.js";
import { memories } from "./schema.js";
const STOP_WORDS = /* @__PURE__ */ new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "is",
  "it",
  "this",
  "that",
  "are",
  "was",
  "be",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "can",
  "could",
  "should",
  "may",
  "might",
  "not",
  "no",
  "so",
  "if",
  "then",
  "than",
  "too",
  "very",
  "just",
  "about",
  "up",
  "out",
  "all",
  "as",
  "into",
  "also",
  "how",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "each",
  "we",
  "me",
  "my",
  "our",
  "your",
  "its",
  "his",
  "her",
  "they",
  "them",
  "their",
  "you",
  "he",
  "she",
  "i"
]);
function createMemory({ content, category = "general", sourceJobId, relevance = 5 }) {
  const db = getDb();
  const now = Date.now();
  const memory = {
    id: randomUUID(),
    content,
    category,
    sourceJobId: sourceJobId || null,
    relevance,
    createdAt: now,
    updatedAt: now
  };
  db.insert(memories).values(memory).run();
  return memory;
}
function getMemories({ category, limit = 50 } = {}) {
  const db = getDb();
  let query = db.select().from(memories);
  if (category) {
    query = query.where(eq(memories.category, category));
  }
  return query.orderBy(desc(memories.relevance), desc(memories.createdAt)).limit(limit).all();
}
function searchMemories(query, { category, limit = 20 } = {}) {
  const db = getDb();
  const pattern = `%${query}%`;
  const conditions = category ? and(like(memories.content, pattern), eq(memories.category, category)) : like(memories.content, pattern);
  return db.select().from(memories).where(conditions).orderBy(desc(memories.relevance), desc(memories.createdAt)).limit(limit).all();
}
function extractKeywords(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP_WORDS.has(w)).filter((v, i, a) => a.indexOf(v) === i).slice(0, 10);
}
function getRelevantMemories(prompt, { limit = 5 } = {}) {
  const keywords = extractKeywords(prompt);
  if (keywords.length === 0) return [];
  const db = getDb();
  const conditions = keywords.map((kw) => like(memories.content, `%${kw}%`));
  return db.select().from(memories).where(or(...conditions)).orderBy(desc(memories.relevance), desc(memories.createdAt)).limit(limit).all();
}
function updateMemory(id, fields) {
  const db = getDb();
  db.update(memories).set({ ...fields, updatedAt: Date.now() }).where(eq(memories.id, id)).run();
}
function deleteMemory(id) {
  const db = getDb();
  db.delete(memories).where(eq(memories.id, id)).run();
}
function insertMemories(entries) {
  const db = getDb();
  const now = Date.now();
  const rows = entries.map((e) => ({
    id: randomUUID(),
    content: e.content,
    category: e.category || "general",
    sourceJobId: e.sourceJobId || null,
    relevance: e.relevance || 5,
    createdAt: now,
    updatedAt: now
  }));
  if (rows.length > 0) {
    db.insert(memories).values(rows).run();
  }
  return rows;
}
export {
  createMemory,
  deleteMemory,
  getMemories,
  getRelevantMemories,
  insertMemories,
  searchMemories,
  updateMemory
};
