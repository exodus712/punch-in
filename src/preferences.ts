import fs from 'node:fs';
import path from 'node:path';
import { quarantineCorruptFile, writeFileAtomic } from './fsio.js';
import { dataFile } from './store.js';
import { FONTS, TIMER_COLORS, type TimerColor, type TimerFont } from './fonts.js';
import { RING_CONCEPTS, RING_STYLES, type RingConcept, type RingStyle } from './ring.js';

export type ClockFormat = '12h' | '24h';

export interface Preferences {
  setupComplete: boolean;
  clockFormat: ClockFormat;
  font: TimerFont;
  color: TimerColor;
  ringStyle: RingStyle;
  ringConcept: RingConcept;
  reuseLastProject: boolean;
}

export type PreferencesResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export const DEFAULT_PREFERENCES: Preferences = {
  setupComplete: false,
  clockFormat: '12h',
  font: 'blocky',
  color: 'gray',
  ringStyle: 'wide',
  ringConcept: 'day-dial',
  reuseLastProject: false,
};

export function preferencesFile(): string {
  return process.env.PUNCH_PREFERENCES ?? path.join(path.dirname(dataFile()), 'preferences.json');
}

export function loadPreferences(): PreferencesResult<Preferences> {
  return loadPreferencesPath(preferencesFile());
}

export function savePreferences(preferences: Preferences): PreferencesResult<void> {
  return savePreferencesPath(preferencesFile(), preferences);
}

export function loadPreferencesPath(file: string): PreferencesResult<Preferences> {
  if (!fs.existsSync(file)) return { ok: true, value: DEFAULT_PREFERENCES };
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (error) {
    return { ok: false, error: `failed to read preferences ${file}: ${errorMessage(error)}` };
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return { ok: true, value: normalize(parsed) };
  } catch (error) {
    const quarantined = quarantineCorruptFile(file);
    const movedAside = quarantined.ok && quarantined.path
      ? ` The corrupt file was moved aside to ${quarantined.path}.`
      : '';
    return { ok: false, error: `corrupt preferences file ${file}: ${errorMessage(error)}.${movedAside} Starting fresh; restore or delete the backup if needed.` };
  }
}

export function savePreferencesPath(file: string, preferences: Preferences): PreferencesResult<void> {
  const raw = JSON.stringify(preferences, null, 2);
  const written = writeFileAtomic(file, `${raw}\n`, `preferences ${file}`);
  if (!written.ok) return { ok: false, error: written.error };
  return { ok: true, value: undefined };
}

function normalize(value: Record<string, unknown>): Preferences {
  return {
    setupComplete: typeof value.setupComplete === 'boolean' ? value.setupComplete : DEFAULT_PREFERENCES.setupComplete,
    clockFormat: value.clockFormat === '24h' ? '24h' : DEFAULT_PREFERENCES.clockFormat,
    font: isIn(value.font, FONTS) ? value.font : DEFAULT_PREFERENCES.font,
    color: isIn(value.color, TIMER_COLORS) ? value.color : DEFAULT_PREFERENCES.color,
    ringStyle: isIn(value.ringStyle, RING_STYLES) ? value.ringStyle : DEFAULT_PREFERENCES.ringStyle,
    ringConcept: isIn(value.ringConcept, RING_CONCEPTS) ? value.ringConcept : DEFAULT_PREFERENCES.ringConcept,
    reuseLastProject: typeof value.reuseLastProject === 'boolean' ? value.reuseLastProject : DEFAULT_PREFERENCES.reuseLastProject,
  };
}

function isIn<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
