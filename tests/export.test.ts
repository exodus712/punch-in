import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exportCsv, exportJson, exportSessions } from '../src/export.js';
import { savePath, type Session } from '../src/store.js';

let dir: string;
let dataFilePath: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'punch-export-'));
  dataFilePath = path.join(dir, 'punch.json');
  process.env.PUNCH_DATA = dataFilePath;
});

afterEach(() => {
  delete process.env.PUNCH_DATA;
  rmSync(dir, { recursive: true, force: true });
});

function session(project: string, started: Date, ended: Date, durationSecs: number): Session {
  return { project, started_at: started, ended_at: ended, duration_secs: durationSecs };
}

describe('exportCsv', () => {
  test('writes a header and one row per session', () => {
    const csv = exportCsv([
      session('web', new Date(2026, 7, 14, 9, 0, 0), new Date(2026, 7, 14, 10, 0, 0), 3600),
      session('research', new Date(2026, 7, 14, 11, 0, 0), new Date(2026, 7, 14, 11, 30, 0), 1800),
    ]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('project,started_at,ended_at,duration_secs');
    expect(lines[1]).toMatch(/^web,2026-08-14T09:00:00[+-]\d{2}:\d{2},2026-08-14T10:00:00[+-]\d{2}:\d{2},3600$/);
    expect(lines[2]).toMatch(/^research,2026-08-14T11:00:00[+-]\d{2}:\d{2},2026-08-14T11:30:00[+-]\d{2}:\d{2},1800$/);
  });

  test('escapes project names containing commas, quotes, or newlines', () => {
    const csv = exportCsv([
      session('client, "big"', new Date(2026, 7, 14, 9, 0, 0), new Date(2026, 7, 14, 10, 0, 0), 3600),
    ]);
    expect(csv).toContain('"client, ""big"""');
  });
});

describe('exportJson', () => {
  test('round-trips sessions with the goal and an export timestamp', () => {
    const json = exportJson(
      [session('web', new Date(2026, 7, 14, 9, 0, 0), new Date(2026, 7, 14, 10, 0, 0), 3600)],
      6 * 3600,
    );
    const parsed = JSON.parse(json) as {
      exported_at: string;
      goal_secs: number;
      sessions: Array<{ project: string; started_at: string; ended_at: string; duration_secs: number }>;
    };
    expect(parsed.goal_secs).toBe(6 * 3600);
    expect(parsed.exported_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(parsed.sessions).toHaveLength(1);
    expect(parsed.sessions[0].project).toBe('web');
    expect(parsed.sessions[0].duration_secs).toBe(3600);
    expect(parsed.sessions[0].started_at).toMatch(/^2026-08-14T09:00:00[+-]\d{2}:\d{2}$/);
    expect(parsed.sessions[0].started_at).not.toMatch(/Z$/);
  });
});

describe('exportSessions', () => {
  test('defaults to csv and prints the store history', () => {
    const started = new Date(2026, 7, 14, 9, 0, 0);
    const ended = new Date(2026, 7, 14, 10, 0, 0);
    expect(savePath(dataFilePath, {
      active: null,
      history: [session('web', started, ended, 3600)],
      goal_secs: 8 * 3600,
    }).ok).toBe(true);

    const result = exportSessions(null);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('project,started_at,ended_at,duration_secs');
    expect(result.message).toContain('web');
  });

  test('exports json when requested', () => {
    expect(savePath(dataFilePath, {
      active: null,
      history: [],
      goal_secs: 6 * 3600,
    }).ok).toBe(true);

    const result = exportSessions('json');
    expect(result.ok).toBe(true);
    const parsed = JSON.parse(result.message) as { goal_secs: number };
    expect(parsed.goal_secs).toBe(6 * 3600);
  });

  test('rejects unknown formats case-insensitively', () => {
    const result = exportSessions('xml');
    expect(result.ok).toBe(false);
    expect(result.message).toBe("invalid export format 'xml': use csv or json");
  });
});
