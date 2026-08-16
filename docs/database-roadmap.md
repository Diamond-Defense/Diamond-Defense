# Database conversion roadmap

The environment/build workflow, D1-only runtime, and record-level administration
are complete. Remaining phases expand reporting and add safe environment refresh
tooling.

## Phase 1: environment and release workflow

Status: implemented.

- Persistent local D1 with one-command startup.
- Conditional first-run seeding.
- Disposable test D1 isolated from development.
- Separate preview and production binding configuration.
- Branch-aware, guarded deployment command.
- Shared verification command.

## Phase 2: D1 as the only runtime source

Status: implemented.

- Load situations, teams, users, and results exclusively through API routes.
- Remove normal runtime reads from static JSON and localStorage.
- Retain JSON only as an explicit seed/import format.
- Replace silent fallback with a clear database-unavailable state.
- Add tests proving browser storage cannot become a competing source of truth.

Acceptance criteria: the full application operates through local, preview, and
production D1; deleting browser storage does not delete server data; unavailable
database APIs produce a visible error rather than stale data.

## Phase 3: database-native administration

Status: implemented.

- Replace whole-team synchronization with record-level APIs.
- Add create, edit, archive, and restore operations for teams and situations.
- Add player, coach, membership, and password-reset operations.
- Add validation, role authorization, audit timestamps, and revision checks.
- Preserve records referenced by results through archival rather than deletion.

Acceptance criteria: each administrator action changes only the intended rows,
concurrent edits are detected, and no administrator workflow requires editing
or downloading JSON.

## Phase 4: complete results and reporting

- Record completed, failed, and abandoned attempts.
- Preserve team, player, situation revision, positions, retries, score, outcome,
  and timing.
- Add coach filters by team, player, situation, outcome, and date.
- Add player progress and team summary reports.
- Add CSV export, query indexes, and authorization coverage.

Acceptance criteria: coaches can review trustworthy historical results without
browser-local data, and players cannot access another player's or team's report.

## Phase 5: sanitized environment refresh

- Production-to-preview and production-to-local data-only export/import.
- Target backup and typed confirmation.
- Session removal and non-production password replacement.
- Optional player anonymization.
- Target migration-history preservation and post-import validation.

Refresh remains a manual maintenance action and is never part of deployment.
