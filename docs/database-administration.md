# Database administration

Phase 3 replaces whole-database team synchronization with operations scoped to
one team, membership, user password, or situation. Repositories continue to use
the portable `SqliteDatabaseAdapter`; Cloudflare-specific code remains limited
to the D1 adapter.

## Record identity and history

Team IDs, user IDs, and situation keys are permanent identifiers. Renaming a
team or player changes display fields but not its ID, so attempts and audit
records keep valid references.

Teams, memberships, users, and situations are archived instead of deleted.
Archived records are removed from player-facing option lists and authentication,
but remain available to historical attempts and the administrator restore UI.

Every editable record has an integer `revision`. Update, archive, and restore
requests must include the revision loaded by the client:

```http
If-Match: 4
```

A stale revision returns HTTP `409 Conflict`. A missing revision returns HTTP
`428 Precondition Required`. Reload the record before retrying instead of
overwriting another edit.

## Authorization

- Administrators can create teams and administer every team, member, password,
  situation, archived record, and audit entry.
- Every coach has an individual account linked to one active team. Coaches can
  administer player memberships only for their assigned team. Only an
  administrator can create, update, archive, restore, or reset a coach account.
- Coaches can draft situation changes and submit them for review. Only an
  administrator can publish, archive, or restore a situation.
- Players cannot call administration endpoints.
- Every browser write is checked for same-origin access.

## API summary

| Operation | Endpoint |
| --- | --- |
| List/create teams | `GET/POST /api/admin/teams` |
| Update/archive team | `PUT/DELETE /api/admin/teams/:teamId` |
| Restore team | `POST /api/admin/teams/:teamId/restore` |
| Create player or coach membership | `POST /api/admin/teams/:teamId/members` (coach accounts require admin) |
| Update/archive membership | `PUT/DELETE /api/admin/teams/:teamId/members/:userId` |
| Restore membership | `POST /api/admin/teams/:teamId/members/:userId/restore` |
| Reset member password | `PUT /api/admin/teams/:teamId/members/:userId/password` |
| Create situation | `POST /api/situations` |
| Update/archive situation | `PUT/DELETE /api/situations/:key` |
| List archived situations | `GET /api/admin/situations` |
| Restore situation | `POST /api/admin/situations/:key/restore` |
| Recent audit entries | `GET /api/admin/audit` |
| List coach login options | `GET /api/coaches/options` |
| Submit/list coach situation proposals | `POST/GET /api/situation-submissions` |
| Withdraw a pending proposal | `DELETE /api/situation-submissions/:id` |
| Approve or reject a proposal | `PUT /api/admin/situation-submissions/:id` |

The former `PUT /api/teams/sync` endpoint returns HTTP `410 Gone` and must not be
used by new clients.

## Password resets

New player or coach records require a password of at least four characters.
Resetting a password creates a new PBKDF2 salt and hash and removes every active
session for that user. Plain-text passwords are never returned by an API.

## Audit log

Create, update, archive, restore, and password-reset operations write an audit
entry with the actor, entity type, stable entity ID, timestamp, and applicable
before/after JSON. The API returns the 200 most recent entries to an
authenticated administrator.

## Coach accounts and situation review

Coach login uses team, coach account, and password instead of one shared coach
password. The account ID is stable, while its display name and password can be
changed by an administrator. Archiving the coach or team immediately prevents
new logins and invalidates the coach's sessions.

The application header has one Login entry point for players, coaches, and
administrators. After authentication it displays the current account and acts
as Log out. A separate Tools button is shown only to coaches and administrators
and automatically opens the panel allowed for that account role.

The coach and administrator panels share the same six-step situation editor:
details, game state, alignment and targets, ball hit, play sequence, and final
review. The editor tracks unsaved changes, checks all nine positions for a
start, target, tolerance, and coaching note, validates field coordinates and
sequence steps, and provides both sequence-animation and player-view previews.
The final Review step is the working approval area: it contains the
completeness check, change summary, coach rationale, player preview, and the
role-appropriate submit or publish action. New, archive, and discard remain at
the top because they affect the entire editing session. Situation JSON files
are no longer downloaded from this editor; database backup and seed tooling
remain the supported administrative paths.

Submitting as a coach creates a pending proposal containing the full draft, a
required rationale, and the revision of the published situation it was based
on. The published record does not change. Proposal history shows pending,
approved, rejected, and withdrawn states with administrator notes.

An administrator sees a published-versus-proposed comparison and can publish
the complete proposal or select individual changed fields for an update. The
accepted field list is retained with the review record. Rejection requires a
note. Approval is blocked with a revision conflict if the published situation
changed after the coach submitted the draft; the coach must then submit a fresh
revision.

## Admin interface

The Admin drawer is organized into Teams & Accounts, Situations, and Recovery.
All edits show an explicit pending, success, or error message. CSV remains the
only bulk team/roster workflow; JSON upload/download controls are not part of
normal administration. CSV files are validated and previewed without writes,
then committed through one database-native administrator operation only after
the administrator reviews the exact changes. See the
[team CSV import guide](team-csv-import.md). Recovery can reactivate a specific
archived team, player, coach, or situation without changing its stable ID or
historical results.
