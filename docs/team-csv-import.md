# Team CSV import

The administrator CSV workflow updates teams and accounts directly in
D1/SQLite. Uploading a file creates a preview only. The database is changed
after an administrator reviews the preview and selects **Import changes**.

## Workflow

1. Open **Admin Tools → Teams & accounts**, select a team if needed, and expand **CSV roster import**.
2. Download the current template or a CSV for the selected team.
3. Drop the completed CSV into the import area or choose the file.
4. Review change counts, row-level validation messages, and the exact stable
   IDs that will be created, updated, restored, archived, or left unchanged.
5. Confirm that you reviewed the exact preview.
6. If archives are present, separately acknowledge the archive warning.
7. Select **Import changes**.

Canceling a preview does not modify the database. If database records change
between preview and confirmation, the import is rejected and must be previewed
again.

## Current columns

| Column | Meaning |
| --- | --- |
| `record_type` | `team` or `member` |
| `action` | `upsert` or `archive` |
| `team_id` | Stable lowercase database ID |
| `team_name` | Required for a team upsert |
| `season_name` | Required when the team is new or does not have an active season |
| `user_id` | Stable account ID for a member |
| `role` | `player` or `coach` |
| `name` | Player or coach display name |
| `number` | Required for players; blank for coaches |
| `password` | Temporary password of at least 8 characters; required for new accounts, blank preserves an existing password |

Team rows may appear before or after their member rows. New teams referenced in
the same file are created before their accounts. A new team receives the active
season named by `season_name`, and every imported account is attached to that
season. Restored accounts are attached to the team's current active season.

Active team names must be unique, ignoring capitalization and surrounding
spaces. The active season is shown alongside the team name throughout the app,
for example `13U Black — Spring 2027`.

## Safety and compatibility

- Only authenticated administrators can preview, download templates, or commit.
- Files are limited to 512 KB and 100 data records per import.
- Any validation error prevents the entire import; valid rows are not applied
  separately.
- Imported passwords are hashed before storage and never returned in previews.
- Account IDs and login identity stay stable when display names, teams, seasons,
  or jersey numbers change.
- The import rejects a player or coach already active on another team. Use the
  administrator **Add or transfer an existing player** or **Advance roster** workflow instead so
  the move is atomic and historical records remain correctly attributed.
- Active player jersey numbers must be unique within a team.
- A password change invalidates existing sessions and must be changed by the
  account owner after the next login.
- Import operations create one audit-log entry containing the non-sensitive
  change summary and record IDs.
- Existing `[TEAMS]` / `[PLAYERS]` block CSV files remain accepted and display a
  compatibility warning. The modern template is recommended because it uses
  explicit stable IDs and supports coach accounts.

Archive actions preserve historical player results and withdraw only current
practice work. An archived account can be restored to its former team from the
Recovery section or, for a player, added to another team through **Add or
transfer an existing player**.
