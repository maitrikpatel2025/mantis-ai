import fs from 'fs';
import { triggersFile, triggersDir } from './paths.js';
import { executeAction } from './actions.js';
import type { TriggerConfig, TriggerAction, ActionConfig } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TriggerContext {
  body: unknown;
  query: Record<string, string>;
  headers: Record<string, string>;
  [key: string]: unknown;
}

type FireTriggersFunction = (
  path: string,
  body: unknown,
  query?: Record<string, string>,
  headers?: Record<string, string>,
) => void;

interface LoadTriggersResult {
  triggerMap: Map<string, TriggerConfig[]>;
  fireTriggers: FireTriggersFunction;
}

// ---------------------------------------------------------------------------
// Template resolution
// ---------------------------------------------------------------------------

/**
 * Replace {{body.field}} templates with values from request context.
 */
function resolveTemplate(template: string, context: TriggerContext): string {
  return template.replace(/\{\{(\w+)(?:\.(\w+))?\}\}/g, (match: string, source: string, field: string | undefined): string => {
    const data = context[source] as Record<string, unknown> | undefined;
    if (data === undefined) return match;
    if (!field) return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    if (data[field] !== undefined) return String(data[field]);
    return match;
  });
}

/**
 * Execute all actions for a trigger (fire-and-forget).
 */
async function executeActions(trigger: TriggerConfig, context: TriggerContext): Promise<void> {
  for (const action of trigger.actions) {
    try {
      const resolved: TriggerAction = { ...action };
      if (resolved.command) resolved.command = resolveTemplate(resolved.command, context);
      if (resolved.job) resolved.job = resolveTemplate(resolved.job, context);
      const result: string | undefined = await executeAction(resolved as unknown as ActionConfig & Record<string, unknown>, { cwd: triggersDir, data: context.body, source: 'trigger' });
      console.log(`[TRIGGER] ${trigger.name}: ${result || 'ran'}`);
    } catch (err) {
      console.error(`[TRIGGER] ${trigger.name}: error - ${(err as Error).message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load triggers from TRIGGERS.json and return trigger map + fire function.
 */
function loadTriggers(): LoadTriggersResult {
  const triggerFile: string = triggersFile;
  const triggerMap = new Map<string, TriggerConfig[]>();

  console.log('\n--- Triggers ---');

  if (!fs.existsSync(triggerFile)) {
    console.log('No TRIGGERS.json found');
    console.log('----------------\n');
    return { triggerMap, fireTriggers: () => {} };
  }

  const triggers: TriggerConfig[] = JSON.parse(fs.readFileSync(triggerFile, 'utf8'));

  for (const trigger of triggers) {
    if (trigger.enabled === false) continue;

    if (!triggerMap.has(trigger.watch_path)) {
      triggerMap.set(trigger.watch_path, []);
    }
    triggerMap.get(trigger.watch_path)!.push(trigger);
  }

  const activeCount: number = [...triggerMap.values()].reduce((sum, arr) => sum + arr.length, 0);

  if (activeCount === 0) {
    console.log('No active triggers');
  } else {
    for (const [watchPath, pathTriggers] of triggerMap) {
      for (const t of pathTriggers) {
        const actionTypes: string = t.actions.map((a: TriggerAction) => a.type || 'agent').join(', ');
        console.log(`  ${t.name}: ${watchPath} (${actionTypes})`);
      }
    }
  }

  console.log('----------------\n');

  /**
   * Fire matching triggers for a given path (non-blocking).
   */
  function fireTriggers(path: string, body: unknown, query: Record<string, string> = {}, headers: Record<string, string> = {}): void {
    const matched: TriggerConfig[] | undefined = triggerMap.get(path);
    if (matched) {
      const context: TriggerContext = { body, query, headers };
      for (const trigger of matched) {
        executeActions(trigger, context).catch((err: unknown) => {
          console.error(`[TRIGGER] ${trigger.name}: unhandled error - ${(err as Error).message}`);
        });
      }
    }
  }

  return { triggerMap, fireTriggers };
}

export { loadTriggers };
