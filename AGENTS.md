# AGENTS.md

Guidance for AI agents working in this repository.

## What this is

`punch` is a small terminal time tracker built with Bun, TypeScript, React, and Ink. Session history lives in a local JSON file; there is no server or account. It is distributed via npm, standalone installers (Windows/macOS/Linux), and GitHub releases.

## Project layout

```text
src/main.ts          CLI entry: arg parsing, help text, dispatch to commands, TUI bootstrap
src/commands.ts      Non-interactive command logic (in/out/status/goal/edit), returns CmdResult
src/store.ts         Data file paths, load/save (atomic), date helpers, formatting
src/preferences.ts   Preferences load/save (atomic) with normalization to defaults
src/fsio.ts          Shared atomic write and corrupt-file quarantine helpers
src/export.ts        CSV/JSON export of session history
src/uninstall.ts     Uninstall flow, install-manifest validation, data removal
src/views.tsx        Ink TUI components (timer, setup, settings, help, activity, editor)
src/fonts.ts         Timer fonts and color palettes
src/ring.ts          Ring styles and concepts drawn around the timer
scripts/             Release build, package verification, preview, installer checks
tests/               Bun test suite (bun:test), one file per module
install.sh/install.ps1  One-line installers used by GitHub releases
```

## Commands

```sh
bun install --frozen-lockfile   # install (Bun 1.4.0+ required)
bun run typecheck               # tsc --noEmit
bun test                        # full suite
bun test --parallel             # faster local run (requires Bun >= 1.4.0, see note)
bun run check                   # typecheck + parallel tests together
bun run dev                     # run the TUI with watch mode
```

Keep all of these green before considering work done. CI (`.github/workflows/ci.yml`) runs audit, typecheck, coverage tests, and `verify:package` on Bun 1.4.0.

Note on `--parallel`: Bun versions before 1.4.0 have a module-init race in the Ink/Yoga rendering tests (`Cannot access 'Yoga' before initialization`). It is fixed in 1.4.0; do not "fix" it by serializing tests or changing imports.

## Conventions

- **Result-style errors everywhere.** Public functions return `{ ok, ... }` unions (`CmdResult`, `IoResult`, `Result`) instead of throwing. Only genuinely unrecoverable paths throw.
- **No UI framework additions.** The TUI is Ink 7 + React 19 with plain `Box`/`Text`. No extra dependencies without discussion.
- **ESM with explicit `.js` import extensions** in source, even for TS files.
- **Local time is the user-facing truth.** Persist timestamps as RFC3339 with local offset (`toRfc3339Local`); compute days with the `isSameDay`/`sessionsOn` helpers, never with UTC dates.
- **Data durability matters.** The JSON history file is the product. Writes go through `writeFileAtomic` (temp file + rename); corrupt files are quarantined (renamed to `*.corrupt-*`), never silently deleted. Keep that behavior in any refactor of `store.ts`/`preferences.ts`.
- **Error messages are user-facing strings**, lowercase, no stack traces, often including the file path. Match the existing tone.
- **Windows is a first-class platform.** Path handling, uninstall, and installers must keep working on Windows; check for `path` separators, case-insensitive comparisons (`samePath`), and PowerShell-specific code before refactoring `uninstall.ts`.

## Testing

- Tests live in `tests/*.test.ts` using `bun:test` (`describe/expect/test`).
- Filesystem tests create a temp dir with `mkdtempSync` in `beforeEach` and clean it in `afterEach`; route file access through the exported `*Path` functions or `PUNCH_DATA`/`PUNCH_PREFERENCES` env overrides. Do not touch real user data paths.
- Ink rendering tests use `ink-testing-library`; keep them deterministic (no real timers).
- New CLI commands need: command logic tests, `main.ts` dispatch + USAGE entry, and a README section.

## Data files (do not break)

- Session history: `punch.json`, path from `PUNCH_DATA` or APPDATA/XDG/`~/.config`.
- Preferences: `preferences.json` beside the data file, path from `PUNCH_PREFERENCES`.
- Formats are versionless JSON; `load*` normalizes old/partial files to defaults instead of rejecting them. Adding fields is fine; renaming or removing existing fields is a breaking change to user data.

## Release flow

Releases are tag-driven: push a `v*` tag matching `package.json` version, and GitHub Actions builds/verifies/uploads artifacts. Version bumps belong in `package.json` only.
