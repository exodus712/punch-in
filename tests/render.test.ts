import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React from 'react';
import { render } from 'ink-testing-library';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { App } from '../src/views.js';
import { DEFAULT_PREFERENCES, savePreferencesPath } from '../src/preferences.js';

let dir: string;
let dataFile: string;
let preferencesFile: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'punch-render-'));
  dataFile = path.join(dir, 'punch.json');
  preferencesFile = path.join(dir, 'preferences.json');
  process.env.PUNCH_DATA = dataFile;
  process.env.PUNCH_PREFERENCES = preferencesFile;
  savePreferencesPath(preferencesFile, { ...DEFAULT_PREFERENCES, setupComplete: true });
});

afterEach(() => {
  delete process.env.PUNCH_DATA;
  delete process.env.PUNCH_PREFERENCES;
  rmSync(dir, { recursive: true, force: true });
});

async function flush(ms = 25): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe('timer interactions', () => {
  test('idle footer exposes frequent actions without setup controls', async () => {
    const instance = render(React.createElement(App));
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).toContain('a activity');
    expect(frame).toContain('? help');
    expect(frame).toContain('i start');
    expect(frame).toContain('q quit');
    expect(frame).not.toContain('design:');
    expect(frame).not.toContain('g goal');
  });

  test('s opens settings from the main timer', async () => {
    const instance = render(React.createElement(App));
    await flush();
    instance.stdin.write('s');
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).toContain('SETTINGS');
  });

  test('starting a project shows the active state and stop action', async () => {
    const instance = render(React.createElement(App));
    await flush();
    instance.stdin.write('i');
    await flush();
    instance.stdin.write('blog');
    await flush();
    instance.stdin.write('\r');
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).toContain('blog');
    expect(frame).toContain('o stop');
    expect(frame).toContain('TRACKING');
  });

  test('Esc cancels punch-out confirmation without writing a session', async () => {
    const instance = render(React.createElement(App));
    await flush();
    instance.stdin.write('i');
    await flush();
    instance.stdin.write('blog');
    await flush();
    instance.stdin.write('\r');
    await flush();
    instance.stdin.write('o');
    await flush();
    expect(instance.lastFrame()).toContain('Esc cancel');
    instance.stdin.write('\x1b');
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).toContain('blog');
    expect(JSON.parse(readFileSync(dataFile, 'utf8')).history).toHaveLength(0);
  });

  test('Enter confirms punch-out and reports the logged project', async () => {
    const instance = render(React.createElement(App));
    await flush();
    instance.stdin.write('i');
    await flush();
    instance.stdin.write('research');
    await flush();
    instance.stdin.write('\r');
    await flush();
    instance.stdin.write('o');
    await flush();
    instance.stdin.write('\r');
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).toContain('Logged');
    expect(frame).toContain('research');
    const stored = JSON.parse(readFileSync(dataFile, 'utf8'));
    expect(stored.active).toBeNull();
    expect(stored.history).toHaveLength(1);
  });

  test('logged status does not leak into Help or Settings', async () => {
    const instance = render(React.createElement(App));
    await flush();
    instance.stdin.write('i');
    await flush();
    instance.stdin.write('research');
    await flush();
    instance.stdin.write('\r');
    await flush();
    instance.stdin.write('o');
    await flush();
    instance.stdin.write('\r');
    await flush();
    instance.stdin.write('?');
    await flush();
    expect(instance.lastFrame()).not.toContain('Logged');
    instance.stdin.write('\x1b');
    await flush();
    instance.stdin.write('s');
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).toContain('SETTINGS');
    expect(frame).not.toContain('Logged');
  });
});

describe('setup and settings', () => {
  test('first launch requires setup before showing the timer', async () => {
    unlinkSync(preferencesFile);
    const instance = render(React.createElement(App));
    await flush();
    expect(instance.lastFrame()).toContain('WELCOME TO PUNCH');
    expect(instance.lastFrame()).not.toContain('ready when you are');

    instance.stdin.write('\r');
    await flush();
    instance.stdin.write('\r');
    await flush();
    instance.stdin.write('\r');
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).toContain('ready when you are');
    expect(JSON.parse(readFileSync(preferencesFile, 'utf8')).setupComplete).toBe(true);
  });

  test('settings uses Space to change and Enter to save', async () => {
    const instance = render(React.createElement(App, { initialScreen: 'settings' }));
    await flush();
    expect(instance.lastFrame()).toContain('SETTINGS');
    expect(instance.lastFrame()).toContain('Space change');

    instance.stdin.write(' ');
    await flush();
    instance.stdin.write('\r');
    await flush();
    const saved = JSON.parse(readFileSync(preferencesFile, 'utf8'));
    instance.unmount();

    expect(saved.clockFormat).toBe('24h');
  });

  test('settings cycles and saves timer colors', async () => {
    const instance = render(React.createElement(App, { initialScreen: 'settings' }));
    await flush();
    instance.stdin.write('\x1b[B');
    await flush();
    instance.stdin.write('\x1b[B');
    await flush();
    expect(instance.lastFrame()).toContain('timer color: gray');
    instance.stdin.write(' ');
    await flush();
    expect(instance.lastFrame()).toContain('timer color: pink');
    instance.stdin.write('\r');
    await flush();
    const saved = JSON.parse(readFileSync(preferencesFile, 'utf8'));
    instance.unmount();

    expect(saved.color).toBe('pink');
  });

  test('Esc discards unsaved settings and returns to the timer', async () => {
    const instance = render(React.createElement(App, { initialScreen: 'settings' }));
    await flush();
    instance.stdin.write(' ');
    await flush();
    instance.stdin.write('\x1b');
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).toContain('ready when you are');
    expect(JSON.parse(readFileSync(preferencesFile, 'utf8')).clockFormat).toBe('12h');
  });
});

describe('help and activity', () => {
  test('Help opens as a read-only overlay and Esc returns to the timer', async () => {
    const instance = render(React.createElement(App));
    await flush();
    instance.stdin.write('?');
    await flush();
    const helpFrame = instance.lastFrame() ?? '';
    expect(helpFrame).toContain('HELP');
    expect(helpFrame).toContain('a open Activity');
    expect(helpFrame).toContain('Esc close');
    expect(helpFrame.split('\n').findIndex((line) => line.trim().length > 0)).toBeGreaterThan(0);
    instance.stdin.write('\x1b');
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).toContain('ready when you are');
    expect(frame).not.toContain('HELP');
  });

  test('Activity opens on today sessions and Tab switches to analytics', async () => {
    const now = new Date();
    const started = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0);
    writeFileSync(dataFile, JSON.stringify({
      active: null,
      history: [{
        project: 'Research',
        started_at: started,
        ended_at: new Date(started.getTime() + 45 * 60 * 1000),
        duration_secs: 45 * 60,
      }],
    }), 'utf8');

    const instance = render(React.createElement(App));
    await flush();
    instance.stdin.write('a');
    await flush();
    const activityFrame = instance.lastFrame() ?? '';
    expect(activityFrame).toContain('ACTIVITY');
    expect(activityFrame).toContain('SESSIONS');
    expect(activityFrame).toContain('Research');
    expect(activityFrame.split('\n').findIndex((line) => line.trim().length > 0)).toBeGreaterThan(0);
    instance.stdin.write('\t');
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).toContain('ANALYTICS');
    expect(frame).toContain('TOTAL');
    expect(frame).toContain('AVERAGE');
    expect(frame).toContain('Research');
  });

  test('Activity shows an active session without inventing a stop time', async () => {
    const started = new Date(Date.now() - 5 * 60 * 1000);
    writeFileSync(dataFile, JSON.stringify({
      active: { project: 'Live', started_at: started },
      history: [],
    }), 'utf8');

    const instance = render(React.createElement(App));
    await flush();
    instance.stdin.write('a');
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).toContain('ACTIVE');
    expect(frame).toContain('Live');
  });

  test('Activity hides the active session when viewing another day', async () => {
    const started = new Date(Date.now() - 5 * 60 * 1000);
    writeFileSync(dataFile, JSON.stringify({
      active: { project: 'Live', started_at: started },
      history: [],
    }), 'utf8');

    const instance = render(React.createElement(App));
    await flush();
    instance.stdin.write('a');
    await flush();
    instance.stdin.write('\x1b[D');
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).not.toContain('ACTIVE');
    expect(frame).not.toContain('Live');
  });

  test('selects and edits a completed session project', async () => {
    const now = new Date();
    const started = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0);
    const ended = new Date(started.getTime() + 45 * 60 * 1000);
    writeFileSync(dataFile, JSON.stringify({
      active: null,
      history: [{
        project: 'Research',
        started_at: started,
        ended_at: ended,
        duration_secs: 45 * 60,
      }],
    }), 'utf8');

    const instance = render(React.createElement(App));
    await flush();
    instance.stdin.write('a');
    await flush();
    expect(instance.lastFrame()).toContain('↑↓ select · Enter edit');
    instance.stdin.write('\r');
    await flush();
    expect(instance.lastFrame()).toContain('EDIT TIME ENTRY');
    instance.stdin.write('\x01');
    await flush();
    instance.stdin.write('Client');
    await flush();
    instance.stdin.write('\r');
    await flush();
    instance.stdin.write('\r');
    await flush();
    instance.stdin.write('\r');
    await flush();
    const frame = instance.lastFrame() ?? '';
    const saved = JSON.parse(readFileSync(dataFile, 'utf8'));
    instance.unmount();

    expect(frame).toContain('ACTIVITY');
    expect(frame).toContain('Client');
    expect(saved.history[0].project).toBe('Client');
  });
});

describe('preference save errors', () => {
  test('shows a preference save error while setup remains open', async () => {
    const blockedParent = path.join(dir, 'blocked-parent');
    writeFileSync(blockedParent, 'not a directory', 'utf8');
    process.env.PUNCH_PREFERENCES = path.join(blockedParent, 'preferences.json');

    const instance = render(React.createElement(App));
    await flush();
    instance.stdin.write('\r');
    await flush();
    instance.stdin.write('\r');
    await flush();
    instance.stdin.write('\r');
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).toContain('failed to prepare directory for preferences');
  });

  test('quarantines an unreadable preferences file and never overwrites it', async () => {
    const corrupt = '{not valid preferences';
    writeFileSync(preferencesFile, corrupt, 'utf8');

    const instance = render(React.createElement(App, { initialScreen: 'settings' }));
    await flush();
    expect(instance.lastFrame()).toContain('Unable to load preferences');
    instance.stdin.write(' ');
    await flush();
    instance.stdin.write('\r');
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).toContain('Unable to save preferences');
    expect(frame).toContain('moved aside');
    expect(existsSync(preferencesFile)).toBe(false);
    const backup = readdirSync(dir).find((name) => name.startsWith('preferences.json.corrupt-'));
    expect(backup).toBeDefined();
    expect(readFileSync(path.join(dir, backup ?? ''), 'utf8')).toBe(corrupt);
  });

  test('quick preference keys also refuse to save over quarantined preferences', async () => {
    const corrupt = '{not valid preferences';
    writeFileSync(preferencesFile, corrupt, 'utf8');

    const instance = render(React.createElement(App, { initialScreen: 'settings' }));
    await flush();
    instance.stdin.write('\x1b');
    await flush();
    instance.stdin.write('t');
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).toContain('Unable to save preferences');
    expect(existsSync(preferencesFile)).toBe(false);
    const backup = readdirSync(dir).find((name) => name.startsWith('preferences.json.corrupt-'));
    expect(backup).toBeDefined();
    expect(readFileSync(path.join(dir, backup ?? ''), 'utf8')).toBe(corrupt);
  });
});

describe('optional project reuse', () => {
  test('prefills the most recent project only when enabled', async () => {
    const started = new Date(Date.now() - 90 * 60 * 1000);
    writeFileSync(dataFile, JSON.stringify({
      active: null,
      history: [{
        project: 'Previous project',
        started_at: started,
        ended_at: new Date(started.getTime() + 30 * 60 * 1000),
        duration_secs: 30 * 60,
      }],
    }), 'utf8');
    savePreferencesPath(preferencesFile, { ...DEFAULT_PREFERENCES, setupComplete: true, reuseLastProject: true });

    const instance = render(React.createElement(App));
    await flush();
    instance.stdin.write('i');
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).toContain('project name: Previous project');
  });
});
