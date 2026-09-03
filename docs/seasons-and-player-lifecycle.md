# Seasons and player data lifecycle

Team seasons provide the boundary for rosters, practice assignments, progress,
and results. A team has at most one active season. Existing teams receive a
default current season when migration `0014_seasons_and_player_lifecycle.sql`
is applied.

## Administrator workflow

Open **Admin Tools**, select **Teams & accounts**, choose a team, and open the
**Seasons** section.

1. Review the active season and its roster, practice, and result counts.
2. Download the season archive before removing historical data.
3. Close the active season. This ends its active practices, releases player
   practice locks, and marks unfinished attempts abandoned.
4. Create the next season. Only members still active on the team are copied
   into the new season roster snapshot.

Closed seasons remain available for export and review. An administrator may
permanently delete one only after typing its exact season name. Deletion removes
that season's roster snapshots, practices, progress, and results and cannot be
undone; there is no separate archived-season state in the interface.

Removed players are excluded from future season snapshots and cannot receive
new assignments. Their prior season membership, practice, and result history
remain available until an administrator deliberately clears or permanently
deletes it.

## Player movement and roster advancement

Player accounts identify the person rather than a particular team. A player
may have historical membership records for several teams and seasons, but the
database permits only one active player-team membership at a time. Their
password and account ID remain unchanged when they move.

Use **Admin Tools → Teams & accounts → Roster → Add or transfer an existing player** for an
individual move:

- **Remove from team** makes the account unassigned while retaining its
  historical season snapshots and results.
- **Add an unassigned player** attaches that existing account to the selected
  team's active season with a new jersey number.
- **Transfer the selected player** removes the active source membership and
  adds the player to the destination team's active season in one database
  operation.

Transfers withdraw only current practice work, abandon any unfinished source
attempt, and sign the player out. Completed assignments and results stay with
their original team and season. The destination must be active and have an
active season. Active jersey numbers must be unique within a team.

For an age-level transition, close the source season and use **Seasons →
Advance roster**. Select the players and coaches to move, then either choose an
existing active team or create the next team and its first season together.
The source team remains available for a future group, so display names such as
`13U Black` remains the team name while the active season distinguishes it as
`13U Black — Spring 2027`. Another active team cannot use the same team name.
Moving a roster is not a destructive clone: the same accounts move
forward while historical membership snapshots remain on the source season.

Duplicating or creating a retake from an older practice creates a draft in the
team's current active season. Only players who are active in that season are
copied as recipients, preventing former players from receiving new work.

## Export and cleanup

**Export season data** produces an authenticated CSV containing the
season roster snapshots and saved result summaries. Spreadsheet formula
characters are escaped. Export the file before cleanup and store it according
to the organization's privacy and retention policy.

Historical deletion is kept under **Data management** rather than mixed with
current roster or season controls. Only closed seasons are listed.
Select a historical season and player, export the season if needed, and then
use **Preview deletion impact**. The preview is read-only and reports the
membership, practice-recipient, progress, and result records associated with
that player.

**Delete player’s season records** becomes available only after a successful
preview for the currently selected season and player. It permanently removes
that player's season snapshot, assignment recipient/progress records, and
attempts from the selected season. It does not alter another season and does
not delete or disable the player account.

## Removing and restoring team members

**Remove from team** is the normal roster departure action. It:

- marks the current season membership snapshot removed;
- withdraws the member from current-season practice;
- abandons an unfinished attempt with a removal reason;
- prevents future assignments and new login access when the user has no other
  active membership; and
- revokes all existing sessions.

Historical results remain intact. Restoring a member requires an active season
and places the account into that current season. It does not rewrite the
historical season snapshot.

## Permanent player and team deletion

**Delete player permanently** is kept in a separate administrator-only danger
zone and cannot be undone. It removes the player credential, identifying profile, memberships,
sessions, practice recipients and progress, and attempts across every team and
season. Related identifying application-audit entries are removed as well.

The only retained deletion record contains the action time, the administrator
role, and aggregate counts of removed record types. It does not retain the
player ID, name, number, username, or other identifying information.

A team must have no active season before it can be permanently deleted. The
administrator first sees counts for seasons, memberships, practices, and
results, then types the exact team name. By default, player and coach accounts
are kept as unassigned accounts, while the deleted team's own history is
removed. An explicit checkbox can instead permanently delete every player
still assigned to that team and all of each player's records across all teams
and seasons. Coach accounts are retained and become unassigned. All affected
accounts are signed out.

## Database model

- `team_seasons` stores the team's named active and closed seasons.
- `season_memberships` stores immutable season roster identity snapshots and a
  removed status.
- `team_memberships.season_id` identifies each active membership's current
  season.
- `practice_assignments.season_id` binds every assignment and retake cycle to
  one season.
- `attempts.season_id` binds every free-play or assigned result to one season.
- `assignment_recipients.withdrawn_at` excludes removed players without
  deleting historical assignment data.
- `deletion_audit` stores non-identifying permanent-deletion counts.

Reporting accepts an optional `seasonId` filter, while ordinary team reporting
continues to include historical seasons by default.

## API summary

| Operation | Endpoint |
| --- | --- |
| List seasons and season roster snapshots | `GET /api/admin/teams/:teamId/seasons` |
| Create the next season | `POST /api/admin/teams/:teamId/seasons` |
| Close a season | `PATCH /api/admin/teams/:teamId/seasons/:seasonId` |
| Delete a closed season | `DELETE /api/admin/teams/:teamId/seasons/:seasonId` |
| List unassigned player accounts | `GET /api/admin/players/unassigned` |
| Add an unassigned player to a team | `POST /api/admin/teams/:teamId/members/existing` |
| Transfer one active player | `POST /api/admin/players/:userId/transfer` |
| Advance selected roster members | `POST /api/admin/teams/:teamId/advance` |
| Download the season archive | `GET /api/admin/teams/:teamId/seasons/:seasonId/export` |
| Preview cleanup counts | `GET /api/admin/teams/:teamId/seasons/:seasonId/cleanup` |
| Clear one player's selected-season records | `POST /api/admin/teams/:teamId/seasons/:seasonId/cleanup` |
| Permanently delete a player | `DELETE /api/admin/users/:userId` |
| Preview/delete a team permanently | `GET /api/admin/teams/:teamId/deletion-preview`, `DELETE /api/admin/teams/:teamId/permanent` |

All write endpoints require same-origin requests and an administrator session.
Cleanup and permanent deletion also require explicit server-validated
confirmation phrases.

## Migration and verification

Migrations `0014_seasons_and_player_lifecycle.sql`,
`0015_player_team_transfers.sql`, and `0016_team_season_workflow.sql` are applied by
the existing migration commands. Each command applies every pending migration
in filename order, so it is safe to wait and apply `0013` through `0016` together
before deploying the matching application code.

Migration `0016` makes active team names unique and removes the obsolete team
contact-email column. Legacy databases may already contain duplicate active
names. The migration preserves every team, keeps the best current match unchanged,
and adds a visible `[legacy-ID]` suffix to the other duplicate names before it
creates the unique index. Administrators can then review and rename those teams
in Team management. This query can be used as an optional preflight check:

```sql
SELECT lower(trim(name)) AS normalized_name, COUNT(*) AS total
FROM teams
WHERE active = 1
GROUP BY lower(trim(name))
HAVING COUNT(*) > 1;
```

```sh
npm run db:migrate:local
npm run db:migrate:preview
npm run db:migrate:production
```

Run the preview and production commands from the branch whose Wrangler file
contains the correct database ID. Apply migrations immediately before the
matching Worker deployment. Do not deploy this application code against a
database that has not received migration `0016`.

Local verification remains:

```sh
npm run check
npm run build
npm test
```

The API coverage verifies session revocation, former-player assignment
rejection, history preservation after roster removal, season-scoped cleanup,
account retention after cleanup, complete permanent deletion, single active
team enforcement, individual transfer, unassigned-player reuse, duplicate
jersey rejection, closed-season deletion, permanent team deletion, and
closed-season roster advancement.

## Controlled test-data reset

The test seed contains two active teams with two players and one coach each,
one unassigned player, and one closed historical season. Every test account uses
the password `password`. Resets require an exact typed confirmation and are
available only for local and preview databases:

```sh
npm run db:reset:test:local
npm run db:reset:test:preview
```

The preview reset creates a backup beneath `.wrangler/reset-backups` before it
changes data. No production reset command exists.
