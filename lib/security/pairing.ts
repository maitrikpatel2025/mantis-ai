'use strict';

import { randomUUID } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { settings } from '../db/schema.js';
import type { PairingCode } from '../types.js';

const PAIRING_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Generate a 6-character alphanumeric pairing code for a channel.
 * Stored in the settings table with a 15-minute TTL.
 */
export function generatePairingCode(channelId: string): PairingCode {
  const db = getDb();
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const now = Date.now();
  const expiresAt = now + PAIRING_EXPIRY_MS;

  // Delete any existing pairing code for this channel
  db.delete(settings)
    .where(and(eq(settings.type, 'pairing'), eq(settings.key, `pairing:${channelId}`)))
    .run();

  db.insert(settings).values({
    id: randomUUID(),
    type: 'pairing',
    key: `pairing:${channelId}`,
    value: JSON.stringify({ code, channelId, expiresAt }),
    createdAt: now,
    updatedAt: now,
  }).run();

  return { code, channelId, expiresAt };
}

/**
 * Verify a pairing code and add the sender to the channel's allowlist.
 * Returns true if pairing succeeded, false if code is invalid/expired.
 */
export function verifyPairingCode(channelId: string, senderId: string, code: string): boolean {
  const db = getDb();

  const row = db
    .select()
    .from(settings)
    .where(and(eq(settings.type, 'pairing'), eq(settings.key, `pairing:${channelId}`)))
    .get();

  if (!row) return false;

  const data: PairingCode = JSON.parse(row.value);

  // Check expiry
  if (Date.now() > data.expiresAt) {
    // Clean up expired code
    db.delete(settings).where(eq(settings.id, row.id)).run();
    return false;
  }

  // Check code match (case-insensitive)
  if (data.code.toUpperCase() !== code.toUpperCase()) {
    return false;
  }

  // Code valid — add sender to allowlist
  addToAllowlist(channelId, senderId);

  // Delete the used pairing code
  db.delete(settings).where(eq(settings.id, row.id)).run();

  return true;
}

/**
 * Add a sender ID to a channel's DM allowlist.
 */
function addToAllowlist(channelId: string, senderId: string): void {
  const db = getDb();
  const key = `allowlist:${channelId}`;

  const row = db
    .select()
    .from(settings)
    .where(and(eq(settings.type, 'security'), eq(settings.key, key)))
    .get();

  let allowlist: string[];
  if (row) {
    allowlist = JSON.parse(row.value);
    if (!allowlist.includes(senderId)) {
      allowlist.push(senderId);
    }
    db.update(settings)
      .set({ value: JSON.stringify(allowlist), updatedAt: Date.now() })
      .where(eq(settings.id, row.id))
      .run();
  } else {
    allowlist = [senderId];
    db.insert(settings).values({
      id: randomUUID(),
      type: 'security',
      key,
      value: JSON.stringify(allowlist),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }).run();
  }
}

/**
 * Get the allowlist for a channel.
 */
export function getAllowlist(channelId: string): string[] {
  const db = getDb();
  const row = db
    .select()
    .from(settings)
    .where(and(eq(settings.type, 'security'), eq(settings.key, `allowlist:${channelId}`)))
    .get();

  if (!row) return [];
  return JSON.parse(row.value);
}
