# Cloudflare Workers deployment

## One repository, two isolated Workers

Diamond Defense has one GitHub repository and one application codebase. It uses
two Cloudflare Worker services so each branch can have its own D1 database and
deployment history:

| Git branch | Worker service | Wrangler environment | D1 database |
|---|---|---|---|
| `preview` | `diamond-defense-preview` | `preview` | `diamond-defense-preview` |
| `main` | `diamond-defense-production` | `production` | `diamond-defense-production` |

The Worker names do not represent separate repositories or separate copies of
the application. They are environment-specific Cloudflare services created from
the same source. Keeping them separate prevents preview code, bindings, data,
and rollbacks from affecting production.

Any other Git branch is rejected by the repository deployment wrapper. Feature
branches can still be tested locally before they are merged into `preview`.

## Worker runtime configuration

`wrangler.jsonc` configures SvelteKit as a Worker with static assets:

```text
Worker entry point: .svelte-kit/cloudflare/_worker.js
Static assets:      .svelte-kit/cloudflare
D1 binding:         DB
Compatibility:      nodejs_compat
```

The `env.preview` and `env.production` sections select the matching Worker name
and D1 binding. D1 bindings are deliberately repeated because Wrangler does not
inherit non-inheritable bindings into named environments.

## First-time D1 setup

Authenticate and create both D1 databases:

```sh
npx wrangler login
npx wrangler d1 create diamond-defense-preview
npx wrangler d1 create diamond-defense-production
```

Copy each returned UUID into the matching `env.preview` or `env.production`
`database_id` value in `wrangler.jsonc`. A real deployment refuses to continue
while its selected database still has a placeholder UUID.

Apply migrations before the first deployment:

```sh
npm run db:migrate:preview
npm run db:migrate:production
```

Migration commands are repeatable. D1 applies only migrations that have not
already been recorded.

## Preview Worker Builds configuration

Create or connect the GitHub repository to the Worker named
`diamond-defense-preview`, then use these settings:

```text
Production branch: preview
Root directory: /
Build command: npm run build
Deploy command: npx wrangler deploy --env preview
Non-production branch deploy command: npx wrangler versions upload --env preview
```

The word “production” in the first setting means the primary branch for this
particular Worker service. For the preview Worker, that branch is `preview`; it
does not make the service the real production application.

Use a dedicated Cloudflare API token for this repository. Do not reuse a token
from an unrelated site. The token must be able to deploy Workers and access the
account resources referenced by `wrangler.jsonc`. Store it in Cloudflare's build
configuration, never in the repository.

## Production Worker Builds configuration

After the production D1 UUID is configured and the preview deployment has been
accepted, connect the same GitHub repository to the Worker named
`diamond-defense-production`:

```text
Production branch: main
Root directory: /
Build command: npm run build
Deploy command: npx wrangler deploy --env production
Non-production branch deploy command: npx wrangler versions upload --env production
```

Normally, disable non-production branch builds on the production Worker. The
`preview` Worker is the controlled place for live pre-production testing.

## Local validation and direct deployment

Validate branch mapping without changing Cloudflare:

```sh
npm run deploy:cloudflare -- --branch preview --dry-run
npm run deploy:cloudflare -- --branch main --dry-run
```

From `preview` or `main`, a reviewed direct deployment can be run with:

```sh
npm run deploy:cloudflare
```

The wrapper:

1. Maps the current branch to its Wrangler environment.
2. Validates the environment-specific D1 binding and UUID.
3. Runs `npm run verify` against isolated local test D1.
4. Applies only pending migrations to the selected remote D1 database.
5. Deploys the SvelteKit Worker with `wrangler deploy --env ...`.

It never imports seed data and never resets a remote database.

When Cloudflare Git integration is enabled, routine releases should be Git
triggered. Do not also run the direct deployment command for the same commit,
because that would create a duplicate deployment.

## Release sequence

1. Add backward-compatible application and migration changes on a feature branch.
2. Apply and verify its pending migrations against preview.
3. Merge the accepted commit into `preview` and let the preview Worker deploy.
4. Test the preview Worker and D1 data path.
5. Apply the same accepted migrations against production.
6. Merge the accepted commit into `main` and let the production Worker deploy.

Remote migrations create schema but not operational accounts or teams. Initial
data setup is a separate reviewed administration operation. Never deploy the
checked-in demonstration passwords to a public environment.

If a migration succeeds but Worker deployment fails, the previous Worker
version remains active against the migrated schema. Released migrations must
therefore be backward compatible; correct issues with a new migration and
deployment rather than rewriting an applied migration.

## Wrangler diagnostics

The deployment wrapper disables local Wrangler disk logs by default. This does
not change Cloudflare runtime logging. Set `WRANGLER_LOG_PATH` or
`WRANGLER_WRITE_LOGS` explicitly when local CLI diagnostics are needed.

For non-interactive agents, provide `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` through the agent's secret store. Never place
credentials in the repository or a checked-in command.
