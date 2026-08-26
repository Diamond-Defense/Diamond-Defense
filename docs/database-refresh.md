# Production data refresh

Diamond Defense can copy production application data into Cloudflare preview or
the persistent local D1 database. Refresh is an explicit maintenance action; it
is never run by development startup, tests, builds, or deployment.

## Safety model

The refresh command:

1. Allows only `preview` or `local` as a destination. Production has no write
   path in the script.
2. Confirms that preview and production have different D1 database IDs.
3. Requires an exact typed confirmation phrase.
4. Saves a full destination backup before its first change.
5. Exports only the approved application tables from production. It does not
   copy schemas or `d1_migrations`.
6. Applies current migrations to the destination before importing data.
7. Replaces application rows while preserving the destination migration ledger.
8. Removes all sessions and audit-log rows.
9. Replaces every account password with one non-production password and
   replaces contact email addresses with the reserved `example.invalid` domain.
   Replacement hashes use Cloudflare's supported 100,000 PBKDF2 iterations.
10. Verifies imported row counts, password replacement, email sanitization,
    empty sessions/audit tables, and unchanged migration history.

If an operation fails after the destination backup, the script prints the exact
backup location. It does not automatically restore the backup because a restore
is another destructive action that should be reviewed separately.

## Preview refresh

First inspect the resolved environments without accessing Cloudflare:

```sh
npm run db:refresh:preview -- --dry-run
```

Then run the refresh:

```sh
npm run db:refresh:preview
```

Type `REFRESH PREVIEW` when prompted, then enter and confirm the shared password
that administrators, coaches, and players will use in preview. Password entry is
hidden and the plaintext value is not written to a file or passed to Wrangler.

To also replace player display names and usernames with `Player 001`,
`nonprod-player-001`, and so on:

```sh
npm run db:refresh:preview -- --anonymize-players
```

Stable player database IDs remain unchanged so attempts and memberships retain
their relationships. This option therefore removes names shown in the app but
is not intended as an irreversible de-identification export.

## Local refresh

```sh
npm run db:refresh:local -- --dry-run
npm run db:refresh:local
```

Type `REFRESH LOCAL` when prompted. The command replaces `.wrangler/state` data;
it does not touch the isolated `.wrangler/test-state` database. After completion,
start the app normally with `npm run dev:local` and use the replacement password.

## Non-interactive use

Use a protected secret store, never a checked-in shell script or configuration:

```sh
DIAMOND_DEFENSE_REFRESH_PASSWORD='a strong temporary password' \
DIAMOND_DEFENSE_REFRESH_CONFIRMATION='REFRESH PREVIEW' \
npm run db:refresh:preview -- --anonymize-players
```

`--confirm "REFRESH PREVIEW"` or `--confirm "REFRESH LOCAL"` may be used instead
of the confirmation environment variable. There is deliberately no generic
`--yes` bypass.

## Backups and sensitive files

Destination backups are stored in timestamped directories beneath:

```text
.wrangler/refresh-backups/
```

They use owner-only file permissions and are ignored by Git, but they still
contain password hashes and application history. Protect them and delete them
through an approved maintenance process when no longer needed. The temporary
raw production export and generated replacement SQL are removed automatically.

The retained backup is a full D1 SQL export. Before a manual restoration, stop,
review the target and the backup timestamp, and create another current backup.
