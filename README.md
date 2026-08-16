# Diamond Defense

Diamond Defense is a SvelteKit baseball situation simulator and interactive
playbook trainer. Its persistent data layer uses portable SQLite schema and
repository code, with Cloudflare D1 as the first hosting adapter.

## Data architecture

```text
Browser UI
  -> SvelteKit /api routes
  -> portable SQLite repositories
  -> D1 adapter
  -> Cloudflare D1 (production) or local D1/SQLite (development)
```

Cloudflare-specific database calls are isolated in
`src/lib/server/database/d1-adapter.ts`. Repositories depend only on the small
`SqliteDatabaseAdapter` contract, so another SQLite provider can be added
without changing the game UI, API behavior, schema, or repository queries.

The browser's previous JSON/localStorage behavior remains as a static/offline
fallback. When the `/api` routes are available, situations, teams, login
sessions, attempts, and coach reports use SQLite.

## Local Cloudflare D1 development

Install dependencies and generate the seed SQL:

```sh
npm install
npm run db:seed:generate
```

Create the local database schema and seed it:

```sh
npm run db:migrate:local
npm run db:seed:local
```

Build and run the complete Cloudflare application:

```sh
npm run dev:cloudflare
```

Wrangler serves the app at `http://localhost:8788`. The local database is
stored in `.wrangler/state` and is separate from production.

`npm run dev` still runs the UI-only Vite server at
`http://127.0.0.1:4173`; database features use the local/static fallback in
that mode.

## Initial local accounts

The generated development seed includes these existing test credentials:

```text
Player: 13U Black / Bob Smith / 1234
Coach: coach
Admin: admin
```

Passwords are salted and hashed before being placed in SQLite. Change the
staff and player passwords before using production with real teams.

Set `DIAMOND_DEFENSE_ADMIN_PASSWORD` and
`DIAMOND_DEFENSE_COACH_PASSWORD` before running `db:seed:generate` to create
a seed with non-demo staff passwords. Player seed passwords come from the
current team JSON and should also be replaced before importing production
data.

## Database files

```text
migrations/0001_initial.sql          Portable SQLite schema
database/seed.sql                    Generated portable SQL seed
scripts/generate-seed-sql.mjs        Converts current JSON to SQL and hashes passwords
wrangler.jsonc                       Cloudflare binding and local runtime configuration
src/lib/server/database/             Portable adapter contract and D1 adapter
src/lib/server/repositories/         SQLite repository implementations
src/routes/api/                      Authenticated application endpoints
```

Do not edit generated `database/seed.sql` by hand. Update the source JSON and
regenerate it until the admin screens become the only data-management path.

## Verification

The default suite starts a local Cloudflare Pages server with local D1:

```sh
npm run check
npm test
npm run build
```

Database API coverage includes password-free roster responses, player login,
attempt persistence, authorization, and coach team reports.

## Deploying to Cloudflare Pages

Create the production database:

```sh
npx wrangler login
npx wrangler d1 create diamond-defense
```

Replace the placeholder `database_id` in `wrangler.jsonc` with the ID returned
by Cloudflare. Then create and seed the production schema:

```sh
npx wrangler d1 migrations apply diamond-defense --remote
npx wrangler d1 execute diamond-defense --remote --file=database/seed.sql
```

Cloudflare Pages build settings:

```text
Build command: npm run build
Build output directory: .svelte-kit/cloudflare
```

The D1 binding must be named `DB`. The checked-in Wrangler configuration is the
source of truth for that binding.

## Backups and SQLite portability

Export production schema and data with:

```sh
npm run db:export
```

The result is a standard SQL dump. To move to another SQLite provider:

1. Apply the files in `migrations/` to the new database.
2. Import the D1 SQL export.
3. Implement `SqliteDatabaseAdapter` for the new provider.
4. Replace the adapter construction in `database/context.ts`.

The domain models, API endpoints, authentication rules, and game code do not
need to change.

## Current application structure

```text
src/lib/components/                 Svelte UI boundary
src/lib/domain/                     TypeScript domain models
src/lib/server/                     Database, security, and reports
src/lib/legacy/loadRuntime.ts       Tested compatibility loader
src/features/player-coach.js        Existing player, team, and coach behavior
src/game/engine.js                  Existing field, scoring, and game flow
src/admin/admin.js                  Existing administrator behavior
tests/                              Browser, data-contract, and database API tests
```
