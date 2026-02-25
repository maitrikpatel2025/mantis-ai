import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { settings } from "../db/schema.js";
const PAIRING_EXPIRY_MS = 15 * 60 * 1e3;
function generatePairingCode(channelId) {
  const db = getDb();
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const now = Date.now();
  const expiresAt = now + PAIRING_EXPIRY_MS;
  db.delete(settings).where(and(eq(settings.type, "pairing"), eq(settings.key, `pairing:${channelId}`))).run();
  db.insert(settings).values({
    id: randomUUID(),
    type: "pairing",
    key: `pairing:${channelId}`,
    value: JSON.stringify({ code, channelId, expiresAt }),
    createdAt: now,
    updatedAt: now
  }).run();
  return { code, channelId, expiresAt };
}
function verifyPairingCode(channelId, senderId, code) {
  const db = getDb();
  const row = db.select().from(settings).where(and(eq(settings.type, "pairing"), eq(settings.key, `pairing:${channelId}`))).get();
  if (!row) return false;
  const data = JSON.parse(row.value);
  if (Date.now() > data.expiresAt) {
    db.delete(settings).where(eq(settings.id, row.id)).run();
    return false;
  }
  if (data.code.toUpperCase() !== code.toUpperCase()) {
    return false;
  }
  addToAllowlist(channelId, senderId);
  db.delete(settings).where(eq(settings.id, row.id)).run();
  return true;
}
function addToAllowlist(channelId, senderId) {
  const db = getDb();
  const key = `allowlist:${channelId}`;
  const row = db.select().from(settings).where(and(eq(settings.type, "security"), eq(settings.key, key))).get();
  let allowlist;
  if (row) {
    allowlist = JSON.parse(row.value);
    if (!allowlist.includes(senderId)) {
      allowlist.push(senderId);
    }
    db.update(settings).set({ value: JSON.stringify(allowlist), updatedAt: Date.now() }).where(eq(settings.id, row.id)).run();
  } else {
    allowlist = [senderId];
    db.insert(settings).values({
      id: randomUUID(),
      type: "security",
      key,
      value: JSON.stringify(allowlist),
      createdAt: Date.now(),
      updatedAt: Date.now()
    }).run();
  }
}
function getAllowlist(channelId) {
  const db = getDb();
  const row = db.select().from(settings).where(and(eq(settings.type, "security"), eq(settings.key, `allowlist:${channelId}`))).get();
  if (!row) return [];
  return JSON.parse(row.value);
}
export {
  generatePairingCode,
  getAllowlist,
  verifyPairingCode
};
