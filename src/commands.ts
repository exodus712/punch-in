import { formatDuration, load, save, sessionsOn, type Active, type Session } from './store.js';

export const DEFAULT_PROJECT = 'general';

export interface CmdResult {
  ok: boolean;
  message: string;
}

function ok(message: string): CmdResult {
  return { ok: true, message };
}

function fail(message: string): CmdResult {
  return { ok: false, message };
}

export function start(project: string | null): CmdResult {
  const name = project?.trim() || DEFAULT_PROJECT;
  const store = load();
  if (!store.ok) return fail(store.error);
  const data = store.value;
  if (data.active) {
    return fail(`a session is already running for '${data.active.project}'`);
  }
  data.active = {
    project: name,
    started_at: new Date(),
  } satisfies Active;
  const saveErr = save(data);
  if (!saveErr.ok) return fail(saveErr.error);
  return ok(`started tracking '${name}'`);
}

export function stop(): CmdResult {
  const store = load();
  if (!store.ok) return fail(store.error);
  const data = store.value;
  const active = data.active;
  if (!active) {
    return fail('no session is currently running');
  }
  const endedAt = new Date();
  const durationSecs = Math.max(0, Math.floor((endedAt.getTime() - active.started_at.getTime()) / 1000));
  data.history.push({
    project: active.project,
    started_at: active.started_at,
    ended_at: endedAt,
    duration_secs: durationSecs,
  });
  data.active = null;
  const saveErr = save(data);
  if (!saveErr.ok) return fail(saveErr.error);
  return ok(`stopped '${active.project}' after ${formatDuration(durationSecs)}`);
}

export function editSession(index: number, project: string, startedAt: Date, endedAt: Date): CmdResult {
  const name = project.trim();
  if (!name) return fail('project name cannot be blank');
  if (!Number.isFinite(startedAt.getTime()) || !Number.isFinite(endedAt.getTime())) {
    return fail('start and end times must be valid');
  }
  if (endedAt.getTime() < startedAt.getTime()) {
    return fail('end time must be on or after start time');
  }

  const store = load();
  if (!store.ok) return fail(store.error);
  const data = store.value;
  const current = data.history[index];
  if (!current) return fail('time entry not found');

  data.history[index] = {
    ...current,
    project: name,
    started_at: new Date(startedAt),
    ended_at: new Date(endedAt),
    duration_secs: Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000),
  };
  const saveErr = save(data);
  if (!saveErr.ok) return fail(saveErr.error);
  return ok(`updated '${name}'`);
}

export function status(): CmdResult {
  const store = load();
  if (!store.ok) return fail(store.error);
  const active = store.value.active;
  if (active) {
    const elapsed = Math.max(0, Math.floor((Date.now() - active.started_at.getTime()) / 1000));
    return ok(`tracking '${active.project}' for ${formatDuration(elapsed)}`);
  }
  return ok('no session is running');
}

export function listDay(date: Date): CmdResult {
  const store = load();
  if (!store.ok) return fail(store.error);
  const sessions = sessionsOn(store.value.history, date);
  if (sessions.length === 0) return ok('no sessions logged for this day');

  const projectWidth = Math.max(...sessions.map((session) => session.project.length), 'total'.length);
  const rangeWidth = '00:00 - 00:00'.length;
  const durationWidth = Math.max(10, ...sessions.map((session) => formatDuration(session.duration_secs).length));
  const row = (project: string, range: string, duration: string): string =>
    `${project.padEnd(projectWidth, ' ')}  ${range.padEnd(rangeWidth, ' ')}  ${duration.padStart(durationWidth, ' ')}`;

  const lines = sessions.map((session: Session) =>
    row(
      session.project,
      `${formatClockTime(session.started_at)} - ${formatClockTime(session.ended_at)}`,
      formatDuration(session.duration_secs),
    ),
  );
  const totalSecs = sessions.reduce((sum, session) => sum + session.duration_secs, 0);
  lines.push('');
  lines.push(row('total', '', formatDuration(totalSecs)));
  return ok(lines.join('\n'));
}

function formatClockTime(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function goal(hours: number | null): CmdResult {
  const store = load();
  if (!store.ok) return fail(store.error);
  const data = store.value;
  if (hours === null) {
    return ok(`daily goal: ${formatDuration(data.goal_secs)}`);
  }
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return fail(`invalid goal '${hours}': use a number of hours between 0 and 24`);
  }
  data.goal_secs = Math.round(hours * 3600);
  const saveErr = save(data);
  if (!saveErr.ok) return fail(saveErr.error);
  return ok(`daily goal set to ${formatDuration(data.goal_secs)}`);
}
