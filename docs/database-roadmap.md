# Database conversion roadmap

The environment/build workflow, D1-only runtime, administration, reporting,
environment refresh, and account-security lifecycle are implemented.

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
- Replace the shared coach password with individual team-linked coach accounts.
- Add coach situation proposals with administrator approval or rejection.
- Add validation, role authorization, audit timestamps, and revision checks.
- Preserve records referenced by results through archival rather than deletion.

Acceptance criteria: each administrator action changes only the intended rows,
concurrent edits are detected, and no administrator workflow requires editing
or downloading JSON.

## Phase 4: complete results and reporting

Status: complete. Attempts, filtered coach reports, summaries, and protected
CSV exports use D1/SQLite as their source of truth.

- Completed: record one idempotent database row for each started play-through.
- Completed: record passed, failed, and abandoned outcomes, including resets,
  situation changes, logout, and page closure.
- Completed: preserve team/player/situation snapshots, situation revision,
  positioning checks, final positions, sequence checks, retries, score, outcome,
  and timing.
- Completed: paginate recent team activity and individual player history.
- Completed: coach reports are scoped to the coach's team and filter by player,
  situation, outcome, and date; administrators can query a selected team.
- Completed: player and team summary values are calculated from filtered
  database history rather than browser-local data.
- Completed: CSV export uses the same filters and authorization rules as the
  visible report.
- Completed: reporting indexes and API/browser authorization coverage.

Acceptance criteria: coaches can review trustworthy historical results without
browser-local data, and players cannot access another player's or team's report.

## Phase 5: sanitized environment refresh

Status: implemented.

- Completed: production-to-preview and production-to-local data-only export/import.
- Completed: target backup and exact typed confirmation.
- Completed: session/audit removal, email sanitization, and non-production
  password replacement.
- Completed: optional player display-name and username anonymization while
  retaining stable relationship IDs.
- Completed: target migration-history preservation and post-import validation.

Refresh remains a manual maintenance action and is never part of deployment.

## Phase 6: complete account management

Status: implemented.

- Self-service password changes for every authenticated role.
- Administrator-issued temporary passwords for new and reset accounts.
- Mandatory permanent-password setup before application access.
- Five-attempt login throttling with a 15-minute lock.
- Seven-day absolute and 12-hour idle session expiration.
- Password-change, administrator-reset, and sign-out-everywhere session revocation.
- Safe login messages that distinguish invalid credentials, temporary locks,
  and unavailable account data without revealing whether an account exists.

## Phase 7: assignments and practice queues

Status: implemented.

- Coach-created draft and published assignments scoped to the coach's team.
- Snapshot recipients for team-wide and individual assignments.
- Ordered published situations pinned to immutable situation revisions.
- Player-only **Your Practice** navigation and paginated queues.
- Server-authorized assignment access and attempt-linked progress.
- Not-started, incomplete, completed, overdue, active, and archived lifecycle
  handling. Each situation requires one completed play-through.
- A durable single-assignment player lock, ordered situation progression,
  resume-after-login behavior, and an explicit next-situation handoff.
- Free-play, Playbook, Random, and attempt-API restrictions until every pending
  assignment is completed or ended by authorized staff.
- Close and cancel actions that immediately release players while retaining
  historical results; in-flight attempts remain saveable without advancing an
  ended assignment.
- Coach completion summaries and responsive assignment management.

Acceptance criteria: a player can only access their own active assignments;
starting creates durable incomplete progress and locks the selected assignment;
the server selects the next incomplete situation in order; completing the same
attempt once advances progress; duplicate submissions do not advance progress
twice; pending work cannot be bypassed through another UI or API route; coaches
can see recipient completion without accessing another team's data.
