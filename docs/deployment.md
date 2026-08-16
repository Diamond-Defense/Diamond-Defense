# Cloudflare deployment

## Branch and database mapping

The deployment command recognizes exactly two branches:

| Git branch | Pages environment | D1 database |
|---|---|---|
| `preview` | Preview | `diamond-defense-preview` |
| `main` | Production | `diamond-defense-production` |

Any other branch, including a detached checkout, is rejected before testing,
migration, or deployment.

## First-time Cloudflare setup

Authenticate and create both D1 databases:

```sh
npx wrangler login
npx wrangler d1 create diamond-defense-preview
npx wrangler d1 create diamond-defense-production
```

Copy the returned UUIDs into the matching `env.preview` and `env.production`
`database_id` values in `wrangler.jsonc`. The checked-in zero-based UUIDs are
deliberate placeholders. A real deployment refuses to continue while the
selected environment still has a placeholder.

Create or connect the Cloudflare Pages project named `diamond-defense` and set:

```text
Production branch: main
Allowed preview branch: preview
D1 binding name: DB
```

The Pages preview configuration applies to all preview deployments, so branch
controls should allow only the `preview` branch for this two-environment model.

## Deployment dry run

Validate branch mapping and configuration without changing Cloudflare:

```sh
npm run deploy:cloudflare -- --dry-run
```

An agent may validate a specific branch without checking it out:

```sh
npm run deploy:cloudflare -- --branch preview --dry-run
npm run deploy:cloudflare -- --branch main --dry-run
```

## Real deployment

From `preview` or `main`, run:

```sh
npm run deploy:cloudflare
```

The command:

1. Resolves the branch to the preview or production environment.
2. Validates the environment-specific D1 binding and UUID.
3. Runs `npm run verify` against isolated local test D1.
4. Applies only pending migrations to the selected remote D1 database.
5. Uploads `.svelte-kit/cloudflare` to the matching Pages branch.

It never imports seed data and never resets a remote database.

The deployment wrapper disables local Wrangler disk logs by default. This does
not change Cloudflare runtime logging or deployed application behavior; it only
prevents transient build-agent diagnostics from accumulating on disk. Set
`WRANGLER_LOG_PATH` or `WRANGLER_WRITE_LOGS` explicitly when a deployment needs
additional local CLI diagnostics.

For a non-interactive build agent, provide `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` through its secret store. Do not place credentials in
the repository or command line.

The script performs a direct Wrangler upload. If Cloudflare Git integration is
also enabled, disable automatic deployments or choose Git-triggered deployment
instead; using both would create duplicate builds.

## Release sequence

Test each migration on the `preview` database first. After the preview build is
accepted, merge the same migration and application code into `main`. Do not
manually copy preview data into production.

If a migration succeeds but Pages upload fails, the previous app remains live
against the migrated schema. This is why released migrations must be backward
compatible. Correct problems with a new migration and deployment.

## Initial data

Remote migrations create schema but not operational accounts or teams. Initial
preview/production data setup is a separate reviewed operation. Never deploy the
checked-in demo passwords to a public production application.
