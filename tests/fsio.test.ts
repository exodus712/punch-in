import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { quarantineCorruptFile, writeFileAtomic } from '../src/fsio.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'punch-fsio-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('writeFileAtomic', () => {
  test('writes the content and leaves no temporary files behind', () => {
    const file = path.join(dir, 'data.json');
    const result = writeFileAtomic(file, '{"a":1}\n', 'data file');
    expect(result.ok).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe('{"a":1}\n');
    expect(readdirSync(dir)).toEqual(['data.json']);
  });

  test('creates missing parent directories', () => {
    const file = path.join(dir, 'nested', 'deeper', 'data.json');
    const result = writeFileAtomic(file, 'x', 'data file');
    expect(result.ok).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe('x');
  });

  test('overwrites an existing file', () => {
    const file = path.join(dir, 'data.json');
    expect(writeFileAtomic(file, 'first', 'data file').ok).toBe(true);
    expect(writeFileAtomic(file, 'second', 'data file').ok).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe('second');
    expect(readdirSync(dir)).toEqual(['data.json']);
  });

  test('returns a readable error when the parent is a regular file', () => {
    const blocker = path.join(dir, 'blocker');
    writeFileSync(blocker, 'not a directory', 'utf8');
    const result = writeFileAtomic(path.join(blocker, 'data.json'), 'x', 'data file');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('failed to prepare directory');
  });
});

describe('quarantineCorruptFile', () => {
  test('moves an existing file aside to a .corrupt- name', () => {
    const file = path.join(dir, 'bad.json');
    writeFileSync(file, '{not json', 'utf8');
    const result = quarantineCorruptFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.path).not.toBeNull();
    expect(result.path!.startsWith(`${file}.corrupt-`)).toBe(true);
    expect(existsSync(file)).toBe(false);
    expect(readFileSync(result.path!, 'utf8')).toBe('{not json');
  });

  test('reports nothing to move for a missing file', () => {
    const result = quarantineCorruptFile(path.join(dir, 'missing.json'));
    expect(result).toEqual({ ok: true, path: null });
  });
});
