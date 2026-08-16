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
- Coaches can update their assigned team and administer memberships only for
  that team.
- Players cannot call administration endpoints.
- Every browser write is checked for same-origin access.

## API summary

| Operation | Endpoint |
| --- | --- |
| List/create teams | `GET/POST /api/admin/teams` |
| Update/archive team | `PUT/DELETE /api/admin/teams/:teamId` |
| Restore team | `POST /api/admin/teams/:teamId/restore` |
| Create player or coach membership | `POST /api/admin/teams/:teamId/members` |
| Update/archive membership | `PUT/DELETE /api/admin/teams/:teamId/members/:userId` |
| Restore membership | `POST /api/admin/teams/:teamId/members/:userId/restore` |
| Reset member password | `PUT /api/admin/teams/:teamId/members/:userId/password` |
| Create situation | `POST /api/situations` |
| Update/archive situation | `PUT/DELETE /api/situations/:key` |
| List archived situations | `GET /api/admin/situations` |
| Restore situation | `POST /api/admin/situations/:key/restore` |
| Recent audit entries | `GET /api/admin/audit` |

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

## Admin interface

The existing Admin drawer uses these record-level endpoints. Its Archived
Records section restores teams, members, and situations. JSON and CSV controls
remain optional import/export utilities and are not required for normal database
administration.
