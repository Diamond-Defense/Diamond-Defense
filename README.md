# Diamond Defense

Diamond Defense is a SvelteKit baseball situation simulator and interactive
playbook trainer. Its persistent data layer uses portable SQLite schema and
repositories, with Cloudflare D1 as the first hosting adapter.

## Quick start

Install dependencies, prepare the persistent local D1 database, build the app,
and start it with one command:

```sh
npm install
npm run dev:local
```

Open [http://localhost:8788](http://localhost:8788). To use another port:

```sh
npm run dev:local -- --port 9000
```

The command always applies pending migrations. It installs seed data only when
the local database contains no users, teams, or situations, so routine startup
does not overwrite local passwords or application data.

## Environment model

```text
Browser UI
  -> SvelteKit /api routes
  -> portable SQLite repositories
  -> D1 adapter and DB binding
       -> .wrangler/state         persistent local development
       -> .wrangler/test-state    disposable automated tests
       -> diamond-defense-preview remote Cloudflare preview
       -> diamond-defense-production remote Cloudflare production
```

The local and test databases use the same D1 binding API as Cloudflare. Only
their storage location changes. Cloudflare-specific calls remain isolated in
`src/lib/server/database/d1-adapter.ts`.

Detailed documentation:

- [Local development](docs/development.md)
- [Database environments and migrations](docs/database-environments.md)
- [Production data refresh](docs/database-refresh.md)
- [Database administration API](docs/database-administration.md)
- [Account security and sessions](docs/account-security.md)
- [Role-aware navigation](docs/navigation.md)
- [Complete result recording](docs/result-recording.md)
- [Cloudflare deployment](docs/deployment.md)
- [Database conversion roadmap](docs/database-roadmap.md)

## Common commands

| Command | Purpose |
|---|---|
| `npm run dev:local` | Migrate, conditionally seed, build, and start local D1 |
| `npm run verify` | Run checks, isolated tests, and a production build |
| `npm test` | Run script tests and browser/API tests against isolated D1 |
| `npm run deploy:cloudflare -- --dry-run` | Show the branch deployment target without changing Cloudflare |
| `npm run deploy:cloudflare` | Verify, migrate, and deploy `main` or `preview` |
| `npm run admin:password` | Update the local administrator password |
| `npm run admin:password:preview` | Update the preview administrator password |
| `npm run admin:password:production` | Update the production administrator password |
| `npm run db:seed:situations:production` | Add/update production playbook situations without account data |
| `npm run db:refresh:preview -- --dry-run` | Safely inspect a production-to-preview refresh |
| `npm run db:refresh:local -- --dry-run` | Safely inspect a production-to-local refresh |

`npm run dev:vite` remains available for UI-only troubleshooting, but it does
not provide the local Cloudflare D1 runtime and is not the supported full-app
development command.

Wrangler diagnostics produced by local development and manual database commands
are written beneath `.wrangler/logs`, which is ignored by Git. Automated tests,
verification, and Cloudflare deployment disable Wrangler disk logs by default.
Either behavior can be overridden with an explicit `WRANGLER_LOG_PATH` or
`WRANGLER_WRITE_LOGS` environment variable. These local diagnostics and state
files are never included in a Cloudflare deployment.

## Initial local accounts

The development seed currently contains:

```text
Player: 13U Black / Bob Smith / 1234
Coach: 13U Black / Diamond Defense Coach / coach
Admin: admin
```

These are development credentials only. Generate a production seed with strong
environment-provided staff passwords, or create production accounts through a
controlled administration process before real use.

## Updating the administrator password

Local D1:

```sh
npm run admin:password
```

Preview D1:

```sh
npm run admin:password:preview
```

Production D1:

```sh
npm run admin:password:production
```

The script hides interactive entry, requires at least 12 characters, generates
a fresh PBKDF2 salt and hash using Cloudflare's supported 100,000-iteration
limit, verifies the database update, and invalidates existing administrator
sessions. For automation, provide
`DIAMOND_DEFENSE_NEW_ADMIN_PASSWORD` through the CI secret store; the script
removes it from the environment before launching Wrangler.

The production command also creates `staff-admin` when a newly migrated
production database has no administrator yet. Preview and local commands remain
update-only so an unexpectedly empty database is not silently initialized.

## Database sources

```text
migrations/*.sql                     Ordered portable SQLite migrations
database/seed.sql                    Generated development seed
scripts/generate-seed-sql.mjs        JSON-to-SQL seed generator
wrangler.jsonc                       Local, preview, and production bindings
src/lib/server/database/             Portable adapter and D1 implementation
src/lib/server/repositories/         SQLite repositories
src/routes/api/                      Authenticated API endpoints
```

Do not edit `database/seed.sql` manually. Update its source data and regenerate
it with `npm run db:seed:generate`. Seed execution is intentionally separate
from normal remote deployment.

For preview or production, use the situation-only seed. It is generated from
`situations.json` and never contains teams, users, memberships, or passwords:

```sh
npm run db:seed:situations:generate
npm run db:seed:situations:preview
npm run db:seed:situations:production
```

## Current database state

Situations, teams, login sessions, attempts, and reports use D1/SQLite as the
only runtime source of truth. Each started player run is saved once with an
idempotent run ID and a passed, failed, or abandoned outcome. The record keeps
the positioning checks, sequence stages, timing, and historical team/player/
situation snapshots needed for reliable reports. The JSON files at the repository root are retained
only as explicit seed/import inputs; the running application does not request
them. Browser storage is limited to non-authoritative UI preferences. Team,
member, situation, password, archive, restore, revision, and audit operations
now use the [record-level administration API](docs/database-administration.md).
Password changes, temporary administrator resets, login lockouts, and session
expiration follow the [account security workflow](docs/account-security.md).
Bulk team/account changes use the validated, preview-first
[team CSV import workflow](docs/team-csv-import.md).
Coaches use individual, team-linked accounts and submit situation drafts for
administrator approval; only administrators publish the shared playbook.
Situation categories, difficulty levels, and player browsing follow the
[Playbook metadata and browsing workflow](docs/playbook.md).
Coach reporting supports filtered team/player history, database summaries, and
authenticated CSV downloads as described in the
[coach reporting guide](docs/coach-reporting.md). See the
[production data refresh guide](docs/database-refresh.md) for the guarded
preview/local copy workflow.
