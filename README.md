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
- [Database administration API](docs/database-administration.md)
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
Coach: coach
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
npm run admin:password -- --remote --database diamond-defense-preview
```

Production D1:

```sh
npm run admin:password -- --remote --database diamond-defense-production
```

The script hides interactive entry, requires at least 12 characters, generates
a fresh PBKDF2 salt and hash, verifies the database update, and invalidates
existing administrator sessions. For automation, provide
`DIAMOND_DEFENSE_NEW_ADMIN_PASSWORD` through the CI secret store; the script
removes it from the environment before launching Wrangler.

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

## Current database state

Situations, teams, login sessions, attempts, and reports use D1/SQLite as the
only runtime source of truth. The JSON files at the repository root are retained
only as explicit seed/import inputs; the running application does not request
them. Browser storage is limited to non-authoritative UI preferences. Team,
member, situation, password, archive, restore, revision, and audit operations
now use the [record-level administration API](docs/database-administration.md).
See the [database roadmap](docs/database-roadmap.md) for reporting and
environment-refresh work that follows.

