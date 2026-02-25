import { describe, it, expect, vi } from 'vitest';
import path from 'path';

const paths = await import('../../lib/paths.js');

describe('paths', () => {
  it('PROJECT_ROOT equals process.cwd()', () => {
    expect(paths.PROJECT_ROOT).toBe(process.cwd());
  });

  it('configDir is PROJECT_ROOT/config', () => {
    expect(paths.configDir).toBe(path.join(process.cwd(), 'config'));
  });

  it('cronsFile is PROJECT_ROOT/config/CRONS.json', () => {
    expect(paths.cronsFile).toBe(path.join(process.cwd(), 'config', 'CRONS.json'));
  });

  it('triggersFile is PROJECT_ROOT/config/TRIGGERS.json', () => {
    expect(paths.triggersFile).toBe(path.join(process.cwd(), 'config', 'TRIGGERS.json'));
  });

  it('channelsFile is PROJECT_ROOT/config/CHANNELS.json', () => {
    expect(paths.channelsFile).toBe(path.join(process.cwd(), 'config', 'CHANNELS.json'));
  });

  it('mantisDb defaults to PROJECT_ROOT/data/mantis.sqlite', async () => {
    const saved = process.env.DATABASE_PATH;
    delete process.env.DATABASE_PATH;
    vi.resetModules();
    const freshPaths = await import('../../lib/paths.js');
    expect(freshPaths.mantisDb).toBe(path.join(process.cwd(), 'data', 'mantis.sqlite'));
    if (saved !== undefined) {
      process.env.DATABASE_PATH = saved;
    }
  });

  it('cronDir is PROJECT_ROOT/cron', () => {
    expect(paths.cronDir).toBe(path.join(process.cwd(), 'cron'));
  });

  it('triggersDir is PROJECT_ROOT/triggers', () => {
    expect(paths.triggersDir).toBe(path.join(process.cwd(), 'triggers'));
  });
});
