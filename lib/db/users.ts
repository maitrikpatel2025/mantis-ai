import { randomUUID } from 'crypto';
import { hashSync, genSaltSync, compare } from 'bcrypt-ts';
import { eq, sql } from 'drizzle-orm';
import { getDb } from './index.js';
import { users } from './schema.js';

/**
 * Get the total number of users.
 * Used to detect first-time setup (no users = needs setup).
 */
export function getUserCount(): number {
  const db = getDb();
  const result = db.select({ count: sql<number>`count(*)` }).from(users).get();
  return result?.count ?? 0;
}

/**
 * Find a user by email address.
 */
export function getUserByEmail(email: string) {
  const db = getDb();
  return db.select().from(users).where(eq(users.email, email.toLowerCase())).get();
}

/**
 * Create a new user with a hashed password.
 */
export async function createUser(email: string, password: string) {
  const db = getDb();
  const now = Date.now();
  const passwordHash = hashSync(password, genSaltSync(10));

  const user = {
    id: randomUUID(),
    email: email.toLowerCase(),
    passwordHash,
    role: 'admin',
    createdAt: now,
    updatedAt: now,
  };

  db.insert(users).values(user).run();

  return { id: user.id, email: user.email, role: user.role };
}

/**
 * Atomically create the first user (admin) if no users exist.
 * Uses a transaction to prevent race conditions — only one caller wins.
 */
export function createFirstUser(email: string, password: string) {
  const db = getDb();
  return db.transaction((tx) => {
    const count = tx.select({ count: sql<number>`count(*)` }).from(users).get();
    if ((count?.count ?? 0) > 0) return null;

    const now = Date.now();
    const passwordHash = hashSync(password, genSaltSync(10));
    const user = {
      id: randomUUID(),
      email: email.toLowerCase(),
      passwordHash,
      role: 'admin',
      createdAt: now,
      updatedAt: now,
    };
    tx.insert(users).values(user).run();
    return { id: user.id, email: user.email, role: user.role };
  });
}

/**
 * Verify a password against a user's stored hash.
 */
export async function verifyPassword(user: { passwordHash: string }, password: string): Promise<boolean> {
  return compare(password, user.passwordHash);
}
