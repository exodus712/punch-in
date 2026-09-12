import type { CmdResult } from './commands.js';
import { load, toRfc3339Local, type Session } from './store.js';

const CSV_HEADER = 'project,started_at,ended_at,duration_secs';

function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function exportCsv(sessions: readonly Session[]): string {
  const lines = [CSV_HEADER];
  for (const session of sessions) {
    lines.push([
      csvField(session.project),
      toRfc3339Local(session.started_at),
      toRfc3339Local(session.ended_at),
      String(session.duration_secs),
    ].join(','));
  }
  return lines.join('\n');
}

export function exportJson(sessions: readonly Session[], goalSecs: number): string {
  return `${JSON.stringify(
    {
      exported_at: toRfc3339Local(new Date()),
      goal_secs: goalSecs,
      sessions: sessions.map((session) => ({
        project: session.project,
        started_at: toRfc3339Local(session.started_at),
        ended_at: toRfc3339Local(session.ended_at),
        duration_secs: session.duration_secs,
      })),
    },
    null,
    2,
  )}\n`;
}

export function exportSessions(format: string | null): CmdResult {
  const chosen = (format ?? 'csv').toLowerCase();
  if (chosen !== 'csv' && chosen !== 'json') {
    return { ok: false, message: `invalid export format '${format}': use csv or json` };
  }
  const store = load();
  if (!store.ok) return { ok: false, message: store.error };
  const body = chosen === 'csv'
    ? exportCsv(store.value.history)
    : exportJson(store.value.history, store.value.goal_secs);
  return { ok: true, message: body };
}
