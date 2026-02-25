import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockSchedule = vi.fn().mockReturnValue({ stop: vi.fn() });
const mockValidate = vi.fn().mockReturnValue(true);

vi.mock('node-cron', () => ({
  default: {
    schedule: (...args: any[]) => mockSchedule(...args),
    validate: (...args: any[]) => mockValidate(...args),
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn().mockReturnValue('[]'),
  },
}));

vi.mock('../../lib/paths.js', () => ({
  cronsFile: '/test/config/CRONS.json',
  cronDir: '/test/cron',
}));

vi.mock('../../lib/actions.js', () => ({
  executeAction: vi.fn().mockResolvedValue('ok'),
}));

describe('cron', () => {
  let loadCrons: Function;
  let stopCrons: Function;
  let validateSchedule: Function;
  let getUpdateAvailable: Function;
  let setUpdateAvailable: Function;
  let fs: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    fs = (await import('fs')).default;
    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockReturnValue('[]');

    mockSchedule.mockReturnValue({ stop: vi.fn() });
    mockValidate.mockReturnValue(true);

    const mod = await import('../../lib/cron.js');
    loadCrons = mod.loadCrons;
    stopCrons = mod.stopCrons;
    validateSchedule = mod.validateSchedule;
    getUpdateAvailable = mod.getUpdateAvailable;
    setUpdateAvailable = mod.setUpdateAvailable;
  });

  describe('getUpdateAvailable / setUpdateAvailable', () => {
    it('returns null by default', () => {
      expect(getUpdateAvailable()).toBeNull();
    });

    it('returns the value after setUpdateAvailable is called', () => {
      setUpdateAvailable('2.0.0');

      expect(getUpdateAvailable()).toBe('2.0.0');
    });
  });

  describe('validateSchedule', () => {
    it('delegates to node-cron validate', () => {
      validateSchedule('* * * * *');

      expect(mockValidate).toHaveBeenCalledWith('* * * * *');
    });

    it('returns true for valid schedule', () => {
      mockValidate.mockReturnValue(true);

      expect(validateSchedule('0 9 * * 1')).toBe(true);
    });

    it('returns false for invalid schedule', () => {
      mockValidate.mockReturnValue(false);

      expect(validateSchedule('not a schedule')).toBe(false);
    });
  });

  describe('loadCrons', () => {
    it('returns empty array when no CRONS.json exists', () => {
      fs.existsSync.mockReturnValue(false);

      const result = loadCrons();

      expect(result).toEqual([]);
    });

    it('parses CRONS.json and schedules enabled tasks', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify([
          {
            name: 'test-cron',
            schedule: '* * * * *',
            type: 'command',
            command: 'echo hi',
            enabled: true,
          },
        ]),
      );

      const result = loadCrons();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test-cron');
      expect(mockSchedule).toHaveBeenCalledWith(
        '* * * * *',
        expect.any(Function),
      );
    });

    it('skips disabled crons', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify([
          {
            name: 'disabled-cron',
            schedule: '* * * * *',
            type: 'command',
            command: 'echo disabled',
            enabled: false,
          },
        ]),
      );

      const result = loadCrons();

      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it('skips crons with invalid schedules', () => {
      mockValidate.mockReturnValue(false);
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify([
          {
            name: 'bad-schedule',
            schedule: 'invalid',
            type: 'command',
            command: 'echo bad',
            enabled: true,
          },
        ]),
      );

      const result = loadCrons();

      expect(mockSchedule).not.toHaveBeenCalled();
    });
  });

  describe('stopCrons', () => {
    it('stops all scheduled tasks', () => {
      const mockStop = vi.fn();
      mockSchedule.mockReturnValue({ stop: mockStop });

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify([
          {
            name: 'cron-1',
            schedule: '* * * * *',
            type: 'command',
            command: 'echo 1',
            enabled: true,
          },
          {
            name: 'cron-2',
            schedule: '0 * * * *',
            type: 'command',
            command: 'echo 2',
            enabled: true,
          },
        ]),
      );

      loadCrons();
      stopCrons();

      expect(mockStop).toHaveBeenCalled();
    });
  });
});
