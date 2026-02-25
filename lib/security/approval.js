import { getDb } from "../db/index.js";
import { settings } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { emitEvent } from "../events/bus.js";
function createApprovalRequest(agent, tool, args) {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  db.insert(settings).values({
    id,
    type: "approval",
    key: `approval:${id}`,
    value: JSON.stringify({ agent, tool, args, status: "pending", createdAt: now }),
    createdAt: now,
    updatedAt: now
  }).run();
  emitEvent("approval:created", { id, agent, tool, args });
  return id;
}
async function waitForApproval(id, timeoutMs = 3e5) {
  const db = getDb();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const row = db.select().from(settings).where(eq(settings.id, id)).get();
    if (row) {
      const data = JSON.parse(row.value);
      if (data.status === "approved") return "approved";
      if (data.status === "denied") return "denied";
    }
    await new Promise((resolve) => setTimeout(resolve, 2e3));
  }
  return "timeout";
}
function approveRequest(id) {
  const db = getDb();
  const row = db.select().from(settings).where(eq(settings.id, id)).get();
  if (!row) return;
  const data = JSON.parse(row.value);
  data.status = "approved";
  db.update(settings).set({ value: JSON.stringify(data), updatedAt: Date.now() }).where(eq(settings.id, id)).run();
  emitEvent("approval:resolved", { id, status: "approved" });
}
function denyRequest(id) {
  const db = getDb();
  const row = db.select().from(settings).where(eq(settings.id, id)).get();
  if (!row) return;
  const data = JSON.parse(row.value);
  data.status = "denied";
  db.update(settings).set({ value: JSON.stringify(data), updatedAt: Date.now() }).where(eq(settings.id, id)).run();
  emitEvent("approval:resolved", { id, status: "denied" });
}
function getPendingApprovals() {
  const db = getDb();
  const rows = db.select().from(settings).where(eq(settings.type, "approval")).all();
  return rows.map((row) => {
    const data = JSON.parse(row.value);
    return { id: row.id, ...data };
  }).filter((r) => r.status === "pending");
}
export {
  approveRequest,
  createApprovalRequest,
  denyRequest,
  getPendingApprovals,
  waitForApproval
};
