import { randomUUID, randomBytes, createHash, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "./index.js";
import { settings } from "./schema.js";
const KEY_PREFIX = "tpb_";
let _cache = null;
function generateApiKey() {
  return KEY_PREFIX + randomBytes(32).toString("hex");
}
function hashApiKey(key) {
  return createHash("sha256").update(key).digest("hex");
}
function _ensureCache() {
  if (_cache !== null) return _cache;
  const db = getDb();
  const row = db.select().from(settings).where(eq(settings.type, "api_key")).get();
  if (row) {
    const parsed = JSON.parse(row.value);
    _cache = { keyHash: parsed.key_hash, id: row.id };
  } else {
    _cache = false;
  }
  return _cache;
}
function invalidateApiKeyCache() {
  _cache = null;
}
function createApiKeyRecord(createdBy) {
  const db = getDb();
  db.delete(settings).where(eq(settings.type, "api_key")).run();
  const key = generateApiKey();
  const keyHash = hashApiKey(key);
  const keyPrefix = key.slice(0, 8);
  const now = Date.now();
  const record = {
    id: randomUUID(),
    type: "api_key",
    key: "api_key",
    value: JSON.stringify({ key_prefix: keyPrefix, key_hash: keyHash, last_used_at: null }),
    createdBy,
    createdAt: now,
    updatedAt: now
  };
  db.insert(settings).values(record).run();
  invalidateApiKeyCache();
  return {
    key,
    record: {
      id: record.id,
      keyPrefix,
      createdAt: now,
      lastUsedAt: null
    }
  };
}
function getApiKey() {
  const db = getDb();
  const row = db.select().from(settings).where(eq(settings.type, "api_key")).get();
  if (!row) return null;
  const parsed = JSON.parse(row.value);
  return {
    id: row.id,
    keyPrefix: parsed.key_prefix,
    createdAt: row.createdAt,
    lastUsedAt: parsed.last_used_at
  };
}
function deleteApiKey() {
  const db = getDb();
  db.delete(settings).where(eq(settings.type, "api_key")).run();
  invalidateApiKeyCache();
}
function verifyApiKey(rawKey) {
  if (!rawKey || !rawKey.startsWith(KEY_PREFIX)) return null;
  const keyHash = hashApiKey(rawKey);
  const cached = _ensureCache();
  if (!cached) return null;
  const a = Buffer.from(cached.keyHash, "hex");
  const b = Buffer.from(keyHash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const db = getDb();
    const now = Date.now();
    const row = db.select().from(settings).where(eq(settings.id, cached.id)).get();
    if (row) {
      const parsed = JSON.parse(row.value);
      parsed.last_used_at = now;
      db.update(settings).set({ value: JSON.stringify(parsed), updatedAt: now }).where(eq(settings.id, cached.id)).run();
    }
  } catch {
  }
  return cached;
}
export {
  createApiKeyRecord,
  deleteApiKey,
  generateApiKey,
  getApiKey,
  hashApiKey,
  invalidateApiKeyCache,
  verifyApiKey
};
