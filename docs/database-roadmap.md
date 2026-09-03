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
  strict one-run-per-situation enforcement, and an explicit next-situation
  handoff after completed or interrupted attempts.
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

## Phase 8: seasons and player data lifecycle

Status: implemented in application code; migration pending environment rollout.

- One active season per team with historical closed seasons.
- Season roster snapshots that preserve ordinary departures without carrying
  former players into the next season.
- Season-bound assignment cycles and attempts.
- Export and read-only cleanup previews before destructive maintenance.
- Player-specific cleanup limited to a selected closed season.
- Normal team removal with immediate session revocation and retained history.
- Administrator-only permanent player deletion with a non-identifying count
  audit.

Acceptance criteria: removed players receive no new work; ordinary removal
preserves history; cleanup does not cross season boundaries; permanent deletion
removes credentials, identifying data, practice progress, and results.

## Phase 9: player transfers and roster advancement

Status: implemented in application code; migration pending environment rollout.

- Stable player accounts that can move without changing credentials or losing
  historical results.
- One active team per player and unique active jersey numbers within a team.
- Administrator workflows for unassigned players and direct team transfers.
- Closed-season roster advancement into an existing team or a newly created
  age-level team and season.
- Reusable team display names with database IDs preserving identity.
- CSV safeguards aligned with active-season and stable-account rules.

Acceptance criteria: a player cannot belong to two active teams; transfers
revoke sessions and release current practice; completed history remains on its
original team and season; advancing a roster preserves the source season while
moving only selected accounts.
