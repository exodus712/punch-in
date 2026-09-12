import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { editSession, listDay, start, status, stop } from '../src/commands.js';
import { loadPath, savePath, type Store } from '../src/store.js';

let dir: string;
let dataFile: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'punch-cmd-'));
  dataFile = path.join(dir, 'punch.json');
  process.env.PUNCH_DATA = dataFile;
});

afterEach(() => {
  delete process.env.PUNCH_DATA;
  rmSync(dir, { recursive: true, force: true });
});

function readStore() {
  const loaded = loadPath(dataFile);
  if (!loaded.ok) throw new Error(loaded.error);
  return loaded.value;
}

describe('start', () => {
  test('starts tracking general by default', () => {
    const result = start(null);
    expect(result.ok).toBe(true);
    expect(result.message).toBe("started tracking 'general'");
    expect(readStore().active?.project).toBe('general');
  });

  test('starts tracking a named project', () => {
    const result = start('blog');
    expect(result.ok).toBe(true);
    expect(result.message).toBe("started tracking 'blog'");
    expect(readStore().active?.project).toBe('blog');
  });

  test('trims the project name and falls back to general for empty input', () => {
    expect(start('  ').message).toBe("started tracking 'general'");
  });

  test('rejects a second session while one is running', () => {
    start('web');
    const result = start('blog');
    expect(result.ok).toBe(false);
    expect(result.message).toBe("a session is already running for 'web'");
  });
});

describe('status', () => {
  test('reports no session when idle', () => {
    expect(status().message).toBe('no session is running');
  });

  test('reports the active session and elapsed time', () => {
    start('web');
    const result = status();
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/^tracking 'web' for \d+s$/);
  });
});

describe('stop', () => {
  test('records the session and clears the active one', () => {
    start('web');
    const result = stop();
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/^stopped 'web' after \d+s$/);

    const store = readStore();
    expect(store.active).toBeNull();
    expect(store.history).toHaveLength(1);
    expect(store.history[0].project).toBe('web');
    expect(store.history[0].duration_secs).toBeGreaterThanOrEqual(0);
  });

  test('errors when nothing is running', () => {
    const result = stop();
    expect(result.ok).toBe(false);
    expect(result.message).toBe('no session is currently running');
  });

  test('writes a JSON file on disk', () => {
    start('api');
    stop();
    const raw = readFileSync(dataFile, 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.history).toHaveLength(1);
    expect(parsed.history[0].project).toBe('api');
  });
});

describe('listDay', () => {
  const day = new Date(2026, 7, 14);

  test('reports an empty day', () => {
    const result = listDay(day);
    expect(result).toEqual({ ok: true, message: 'no sessions logged for this day' });
  });

  test('lists sessions with a padded total line', () => {
    savePath(dataFile, {
      active: null,
      history: [
        { project: 'longer-project', started_at: new Date(2026, 7, 14, 9, 5, 0), ended_at: new Date(2026, 7, 14, 10, 5, 0), duration_secs: 3600 },
        { project: 'web', started_at: new Date(2026, 7, 14, 11, 30, 0), ended_at: new Date(2026, 7, 14, 12, 15, 0), duration_secs: 2700 },
        { project: 'other-day', started_at: new Date(2026, 7, 13, 11, 30, 0), ended_at: new Date(2026, 7, 13, 12, 15, 0), duration_secs: 2700 },
      ],
      goal_secs: 8 * 3600,
    });

    const result = listDay(day);
    expect(result.ok).toBe(true);
    const lines = result.message.split('\n');
    expect(lines[0]).toBe('longer-project  09:05 - 10:05  1h 00m 00s');
    expect(lines[1]).toBe('web             11:30 - 12:15     45m 00s');
    expect(lines[2]).toBe('');
    expect(lines[3].startsWith('total')).toBe(true);
    expect(lines[3].endsWith('1h 45m 00s')).toBe(true);
    expect(lines[3].length).toBe(lines[0].length);
  });
});

describe('editSession', () => {
  test('updates the project and recalculates duration', () => {
    const originalStart = new Date(2026, 7, 14, 9, 0, 0);
    const originalEnd = new Date(2026, 7, 14, 10, 0, 0);
    const initial: Store = {
      active: null,
      history: [{ project: 'old name', started_at: originalStart, ended_at: originalEnd, duration_secs: 3600 }],
      goal_secs: 8 * 3600,
    };
    savePath(dataFile, initial);

    const result = editSession(
      0,
      '  client work  ',
      new Date(2026, 7, 14, 11, 15, 0),
      new Date(2026, 7, 14, 12, 45, 30),
    );

    expect(result).toEqual({ ok: true, message: "updated 'client work'" });
    const edited = readStore().history[0];
    expect(edited.project).toBe('client work');
    expect(edited.started_at.getHours()).toBe(11);
    expect(edited.ended_at.getHours()).toBe(12);
    expect(edited.duration_secs).toBe(5430);
  });

  test('rejects blank projects, reversed times, and missing entries', () => {
    const startAt = new Date(2026, 7, 14, 9, 0, 0);
    const endAt = new Date(2026, 7, 14, 10, 0, 0);
    savePath(dataFile, {
      active: null,
      history: [{ project: 'work', started_at: startAt, ended_at: endAt, duration_secs: 3600 }],
      goal_secs: 8 * 3600,
    });

    expect(editSession(0, ' ', startAt, endAt).message).toBe('project name cannot be blank');
    expect(editSession(0, 'work', endAt, startAt).message).toBe('end time must be on or after start time');
    expect(editSession(4, 'work', startAt, endAt).message).toBe('time entry not found');
  });
});
