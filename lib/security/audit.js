import { logAuditEntry, getAuditLogs, getAuditStats } from "../db/audit.js";
function logToolInvocation(entry) {
  logAuditEntry(entry);
}
export {
  getAuditLogs,
  getAuditStats,
  logToolInvocation
};
