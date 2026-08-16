# Local development

## Supported workflow

Run the complete application with:

```sh
npm run dev:local
```

This single command performs these operations in order:

1. Reads the local `DB` binding from `wrangler.jsonc`.
2. Applies unapplied migrations to the persistent local D1 database.
3. Counts users, teams, and situations.
4. Imports `database/seed.sql` only when all three counts are zero.
5. Builds the SvelteKit application with the Cloudflare adapter.
6. Starts `wrangler dev` with the same local D1 storage and Worker entry point.
7. Prints the browser address.

The default address is:

```text
http://localhost:8788
```

Choose another port when needed:

```sh
npm run dev:local -- --port 9000
```

Stop the server with `Ctrl+C`.

## Wrangler diagnostics

Local development, manual database commands, and the administrator-password
command write Wrangler diagnostic files to:

```text
.wrangler/logs
```

This directory is ignored by Git and is not uploaded to Cloudflare. Tests and
`npm run verify` disable Wrangler disk logs so routine validation does not
create a separate diagnostic file for every Wrangler process.

The defaults apply only when neither Wrangler logging variable is already set.
For one-off troubleshooting, select a different directory explicitly:

```sh
WRANGLER_LOG_PATH=/absolute/path/to/logs npm run dev:local
```

To disable disk logging for a local command:

```sh
WRANGLER_WRITE_LOGS=false npm run dev:local
```

## Local database persistence

Development data is stored beneath:

```text
.wrangler/state
```

Wrangler owns the internal directory layout. Application code accesses the
database through the `DB` binding rather than opening the SQLite file directly.
The state survives server restarts and is ignored by Git.

The startup command does not repeatedly seed an existing database. This
protects locally edited teams, situations, results, and password hashes.

## Tests do not use development data

`npm test` starts the app against:

```text
.wrangler/test-state
```

The test server deletes only that directory, then applies migrations and seed
data. It never deletes or reseeds `.wrangler/state`.

The Playwright server uses port `4175` by default. Override it with:

```sh
TEST_PORT=4180 npm test
```

## Verification

Run all maintained validation with:

```sh
npm run verify
```

It runs:

1. Svelte and TypeScript checks.
2. Node workflow/security tests.
3. Browser and database API tests against isolated D1.
4. A final Cloudflare production build.

## UI-only Vite mode

```sh
npm run dev:vite
```

This is retained only for narrow UI troubleshooting. It does not create the
Cloudflare `DB` binding, so it cannot accurately validate database behavior.
Use `dev:local` for normal work.

## Troubleshooting

If port `8788` is in use, select another port. If the database has tables but
is only partially populated, startup preserves it rather than silently
overwriting records; use the explicit migration and seed commands only after
reviewing the data.

Useful diagnostics:

```sh
npm run db:migrate:local
node scripts/wrangler-command.mjs d1 execute diamond-defense --local --persist-to .wrangler/state --command "SELECT COUNT(*) FROM users"
```
