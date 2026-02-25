'use strict';

import type { SanitizeResult } from '../types.js';

/**
 * Dangerous patterns to detect in user input.
 * Each pattern has a name and regex.
 */
const DANGEROUS_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  // Template injection (Mustache/Handlebars/Jinja-style)
  { name: 'template_injection', pattern: /\{\{.*?(constructor|__proto__|prototype).*?\}\}/i },
  // Script tags
  { name: 'script_tag', pattern: /<script[\s>]/i },
  // Event handlers in HTML
  { name: 'html_event_handler', pattern: /\bon\w+\s*=\s*["']/i },
  // Prototype pollution
  { name: 'prototype_pollution', pattern: /__proto__|constructor\s*\[|Object\.assign\s*\(\s*\{\s*\}\s*,/i },
  // eval/exec patterns
  { name: 'code_execution', pattern: /\b(eval|exec|Function|setTimeout|setInterval)\s*\(/i },
  // SQL injection attempts
  { name: 'sql_injection', pattern: /('\s*(OR|AND)\s+')|(--.*)|(;\s*(DROP|ALTER|DELETE|UPDATE|INSERT)\s)/i },
  // Path traversal
  { name: 'path_traversal', pattern: /\.\.\/(\.\.\/){2,}/i },
  // Command injection in backticks or $()
  { name: 'command_injection', pattern: /`[^`]*\$\(|;\s*(rm|curl|wget|bash|sh|nc)\s/i },
];

/**
 * Sanitize user input text.
 * Detects potentially dangerous patterns and returns the sanitized result.
 * Does NOT modify the text — just flags what was found.
 * The caller decides whether to block or proceed.
 */
export function sanitizeInput(text: string): SanitizeResult {
  if (!text || typeof text !== 'string') {
    return { text: '', sanitized: false, patternsFound: [] };
  }

  const patternsFound: string[] = [];

  for (const { name, pattern } of DANGEROUS_PATTERNS) {
    if (pattern.test(text)) {
      patternsFound.push(name);
    }
  }

  return {
    text,
    sanitized: patternsFound.length > 0,
    patternsFound,
  };
}

/**
 * Check if a command string is safe to execute.
 * Returns null if allowed, or a reason string if blocked.
 */
const BLOCKED_COMMANDS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brm\s+(-rf?|--recursive)\s+\/\s*$/i, reason: 'Destructive: rm -rf /' },
  { pattern: /\bsudo\b/i, reason: 'Privilege escalation: sudo' },
  { pattern: /\bchmod\s+777\b/i, reason: 'Insecure permissions: chmod 777' },
  { pattern: /\bcurl\b.*\|\s*(ba)?sh\b/i, reason: 'Remote code execution: curl | sh' },
  { pattern: /\bwget\b.*\|\s*(ba)?sh\b/i, reason: 'Remote code execution: wget | sh' },
  { pattern: /\bmkfs\b/i, reason: 'Destructive: filesystem format' },
  { pattern: /\bdd\s+if=.*of=\/dev\//i, reason: 'Destructive: dd to device' },
  { pattern: /:(){ :|:& };:/i, reason: 'Fork bomb' },
];

/**
 * Check if a shell command is allowed to execute.
 * Returns null if allowed, or a reason string if blocked.
 */
export function isCommandAllowed(command: string): string | null {
  for (const { pattern, reason } of BLOCKED_COMMANDS) {
    if (pattern.test(command)) {
      return reason;
    }
  }
  return null;
}
