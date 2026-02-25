import { getDb } from "../db/index.js";
import { settings } from "../db/schema.js";
import { eq, and, like } from "drizzle-orm";
function getToolPolicy(agent, tool) {
  const db = getDb();
  const specific = db.select().from(settings).where(and(eq(settings.type, "security"), eq(settings.key, `tool_policy:${agent}:${tool}`))).get();
  if (specific) return specific.value;
  const wildcard = db.select().from(settings).where(and(eq(settings.type, "security"), eq(settings.key, `tool_policy:*:${tool}`))).get();
  if (wildcard) return wildcard.value;
  return "allow";
}
function setToolPolicy(agent, tool, policy) {
  const db = getDb();
  const key = `tool_policy:${agent}:${tool}`;
  const now = Date.now();
  const existing = db.select().from(settings).where(and(eq(settings.type, "security"), eq(settings.key, key))).get();
  if (existing) {
    db.update(settings).set({ value: policy, updatedAt: now }).where(eq(settings.id, existing.id)).run();
  } else {
    db.insert(settings).values({
      id: crypto.randomUUID(),
      type: "security",
      key,
      value: policy,
      createdAt: now,
      updatedAt: now
    }).run();
  }
}
function getAllPolicies() {
  const db = getDb();
  const rows = db.select().from(settings).where(like(settings.key, "tool_policy:%")).all();
  return rows.map((row) => {
    const parts = row.key.split(":");
    return { agent: parts[1] || "*", tool: parts[2] || "", policy: row.value };
  });
}
export {
  getAllPolicies,
  getToolPolicy,
  setToolPolicy
};
