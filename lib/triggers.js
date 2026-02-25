import fs from "fs";
import { triggersFile, triggersDir } from "./paths.js";
import { executeAction } from "./actions.js";
function resolveTemplate(template, context) {
  return template.replace(/\{\{(\w+)(?:\.(\w+))?\}\}/g, (match, source, field) => {
    const data = context[source];
    if (data === void 0) return match;
    if (!field) return typeof data === "string" ? data : JSON.stringify(data, null, 2);
    if (data[field] !== void 0) return String(data[field]);
    return match;
  });
}
async function executeActions(trigger, context) {
  for (const action of trigger.actions) {
    try {
      const resolved = { ...action };
      if (resolved.command) resolved.command = resolveTemplate(resolved.command, context);
      if (resolved.job) resolved.job = resolveTemplate(resolved.job, context);
      const result = await executeAction(resolved, { cwd: triggersDir, data: context.body, source: "trigger" });
      console.log(`[TRIGGER] ${trigger.name}: ${result || "ran"}`);
    } catch (err) {
      console.error(`[TRIGGER] ${trigger.name}: error - ${err.message}`);
    }
  }
}
function loadTriggers() {
  const triggerFile = triggersFile;
  const triggerMap = /* @__PURE__ */ new Map();
  console.log("\n--- Triggers ---");
  if (!fs.existsSync(triggerFile)) {
    console.log("No TRIGGERS.json found");
    console.log("----------------\n");
    return { triggerMap, fireTriggers: () => {
    } };
  }
  const triggers = JSON.parse(fs.readFileSync(triggerFile, "utf8"));
  for (const trigger of triggers) {
    if (trigger.enabled === false) continue;
    if (!triggerMap.has(trigger.watch_path)) {
      triggerMap.set(trigger.watch_path, []);
    }
    triggerMap.get(trigger.watch_path).push(trigger);
  }
  const activeCount = [...triggerMap.values()].reduce((sum, arr) => sum + arr.length, 0);
  if (activeCount === 0) {
    console.log("No active triggers");
  } else {
    for (const [watchPath, pathTriggers] of triggerMap) {
      for (const t of pathTriggers) {
        const actionTypes = t.actions.map((a) => a.type || "agent").join(", ");
        console.log(`  ${t.name}: ${watchPath} (${actionTypes})`);
      }
    }
  }
  console.log("----------------\n");
  function fireTriggers(path, body, query = {}, headers = {}) {
    const matched = triggerMap.get(path);
    if (matched) {
      const context = { body, query, headers };
      for (const trigger of matched) {
        executeActions(trigger, context).catch((err) => {
          console.error(`[TRIGGER] ${trigger.name}: unhandled error - ${err.message}`);
        });
      }
    }
  }
  return { triggerMap, fireTriggers };
}
export {
  loadTriggers
};
