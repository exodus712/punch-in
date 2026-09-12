import fs from 'node:fs';
import path from 'node:path';

export type IoResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Writes `data` to `file` atomically: the content lands in a temporary file
 * that is renamed over the target, so an interrupted write can never leave a
 * half-written data file behind.
 */
export function writeFileAtomic(file: string, data: string, what: string = file): IoResult<void> {
  const parent = path.dirname(file);
  try {
    fs.mkdirSync(parent, { recursive: true });
  } catch (error) {
    return { ok: false, error: `failed to prepare directory for ${what}: ${errorMessage(error)}` };
  }

  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
    return { ok: true, value: undefined };
  } catch (error) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // best effort: the temp file is useless anyway
    }
    return { ok: false, error: `failed to write ${what}: ${errorMessage(error)}` };
  }
}

/**
 * Moves an unreadable file aside to `<file>.corrupt-<timestamp>` so the app
 * can start fresh without silently destroying the original bytes.
 */
export function quarantineCorruptFile(file: string): { ok: true; path: string | null } | { ok: false } {
  if (!fs.existsSync(file)) return { ok: true, path: null };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = `${file}.corrupt-${stamp}`;
  try {
    fs.renameSync(file, target);
  } catch {
    return { ok: false };
  }
  return { ok: true, path: target };
}
