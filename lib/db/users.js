import { randomUUID } from "crypto";
import { hashSync, genSaltSync, compare } from "bcrypt-ts";
import { eq, sql } from "drizzle-orm";
import { getDb } from "./index.js";
import { users } from "./schema.js";
function getUserCount() {
  const db = getDb();
  const result = db.select({ count: sql`count(*)` }).from(users).get();
  return result?.count ?? 0;
}
function getUserByEmail(email) {
  const db = getDb();
  return db.select().from(users).where(eq(users.email, email.toLowerCase())).get();
}
async function createUser(email, password) {
  const db = getDb();
  const now = Date.now();
  const passwordHash = hashSync(password, genSaltSync(10));
  const user = {
    id: randomUUID(),
    email: email.toLowerCase(),
    passwordHash,
    role: "admin",
    createdAt: now,
    updatedAt: now
  };
  db.insert(users).values(user).run();
  return { id: user.id, email: user.email, role: user.role };
}
function createFirstUser(email, password) {
  const db = getDb();
  return db.transaction((tx) => {
    const count = tx.select({ count: sql`count(*)` }).from(users).get();
    if ((count?.count ?? 0) > 0) return null;
    const now = Date.now();
    const passwordHash = hashSync(password, genSaltSync(10));
    const user = {
      id: randomUUID(),
      email: email.toLowerCase(),
      passwordHash,
      role: "admin",
      createdAt: now,
      updatedAt: now
    };
    tx.insert(users).values(user).run();
    return { id: user.id, email: user.email, role: user.role };
  });
}
async function verifyPassword(user, password) {
  return compare(password, user.passwordHash);
}
export {
  createFirstUser,
  createUser,
  getUserByEmail,
  getUserCount,
  verifyPassword
};
