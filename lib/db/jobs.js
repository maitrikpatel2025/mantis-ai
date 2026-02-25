import { eq, desc, inArray, sql, gte } from "drizzle-orm";
import { getDb } from "./index.js";
import { jobs } from "./schema.js";
import { emitEvent } from "../events/bus.js";
function insertJob({ id, prompt, enrichedPrompt, source = "chat", branch, runnerType, chatId }) {
  const db = getDb();
  const job = {
    id,
    prompt,
    enrichedPrompt: enrichedPrompt || null,
    status: "created",
    source,
    branch: branch || null,
    runnerType: runnerType || null,
    chatId: chatId || null,
    createdAt: Date.now()
  };
  db.insert(jobs).values(job).run();
  emitEvent("job:created", job);
  return job;
}
function getJobById(jobId) {
  const db = getDb();
  return db.select().from(jobs).where(eq(jobs.id, jobId)).get();
}
function updateJob(jobId, fields) {
  const db = getDb();
  db.update(jobs).set(fields).where(eq(jobs.id, jobId)).run();
  emitEvent("job:updated", { id: jobId, ...fields });
}
function completeJob(jobId, { summary, result, prUrl } = {}) {
  const db = getDb();
  const fields = {
    status: "completed",
    completedAt: Date.now()
  };
  if (summary) fields.summary = summary;
  if (result) fields.result = result;
  if (prUrl) fields.prUrl = prUrl;
  db.update(jobs).set(fields).where(eq(jobs.id, jobId)).run();
  emitEvent("job:completed", { id: jobId, summary, prUrl });
}
function failJob(jobId, error) {
  const db = getDb();
  db.update(jobs).set({ status: "failed", completedAt: Date.now(), error }).where(eq(jobs.id, jobId)).run();
  emitEvent("job:failed", { id: jobId, error });
}
function getRecentJobs({ limit = 20, offset = 0, status } = {}) {
  const db = getDb();
  let query = db.select().from(jobs);
  if (status) {
    query = query.where(eq(jobs.status, status));
  }
  return query.orderBy(desc(jobs.createdAt)).limit(limit).offset(offset).all();
}
function getActiveJobs() {
  const db = getDb();
  return db.select().from(jobs).where(inArray(jobs.status, ["created", "queued"])).orderBy(desc(jobs.createdAt)).all();
}
function getJobsByDay(days = 7) {
  const db = getDb();
  const since = Date.now() - days * 864e5;
  return db.select({
    day: sql`DATE(${jobs.createdAt} / 1000, 'unixepoch')`.as("day"),
    count: sql`COUNT(*)`
  }).from(jobs).where(gte(jobs.createdAt, since)).groupBy(sql`DATE(${jobs.createdAt} / 1000, 'unixepoch')`).orderBy(sql`DATE(${jobs.createdAt} / 1000, 'unixepoch') ASC`).all();
}
function getJobCounts() {
  const db = getDb();
  const rows = db.select({
    status: jobs.status,
    count: sql`COUNT(*)`
  }).from(jobs).groupBy(jobs.status).all();
  const counts = { created: 0, queued: 0, completed: 0, failed: 0 };
  for (const row of rows) {
    counts[row.status] = row.count;
  }
  return counts;
}
export {
  completeJob,
  failJob,
  getActiveJobs,
  getJobById,
  getJobCounts,
  getJobsByDay,
  getRecentJobs,
  insertJob,
  updateJob
};
